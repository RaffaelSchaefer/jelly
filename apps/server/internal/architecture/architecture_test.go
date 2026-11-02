// Package architecture_test checks structural rules that no linter covers, see AGENTS.md.
package architecture_test

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	moduleRoot      = "../.."
	entryPointDir   = "cmd/jelly-server"
	planMarker      = "Concurrency plan:"
	goroutineMethod = "Go"
)

// sourceFile is a parsed Go file with its path relative to the module root.
type sourceFile struct {
	path   string
	syntax *ast.File
	files  *token.FileSet
}

// loadSourceFiles parses all Go files of the module, without hidden folders and test data.
func loadSourceFiles(t *testing.T) []sourceFile {
	t.Helper()
	var sources []sourceFile
	visitEntry := func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if isSkippedDir(entry.Name()) {
				return fs.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}
		source, err := os.ReadFile(filepath.Join(moduleRoot, path))
		if err != nil {
			return err
		}
		parsed, err := parseSource(path, string(source))
		if err != nil {
			return err
		}
		sources = append(sources, parsed)
		return nil
	}
	if err := fs.WalkDir(os.DirFS(moduleRoot), ".", visitEntry); err != nil {
		t.Fatal(err)
	}
	return sources
}

func isSkippedDir(name string) bool {
	if name == "." {
		return false
	}
	return strings.HasPrefix(name, ".") || name == "testdata" || name == "dist"
}

func parseSource(path, source string) (sourceFile, error) {
	files := token.NewFileSet()
	syntax, err := parser.ParseFile(files, path, source, parser.ParseComments)
	if err != nil {
		return sourceFile{}, fmt.Errorf("parse %s: %w", path, err)
	}
	return sourceFile{path: path, syntax: syntax, files: files}, nil
}

// findMainPackages returns the folders that contain a `package main`.
func findMainPackages(sources []sourceFile) map[string]bool {
	mainDirs := make(map[string]bool)
	for _, source := range sources {
		if source.syntax.Name.Name == "main" {
			mainDirs[filepath.ToSlash(filepath.Dir(source.path))] = true
		}
	}
	return mainDirs
}

// findConcurrencyLines returns the lines that start goroutines or use channels.
func findConcurrencyLines(source sourceFile) []int {
	var lines []int
	ast.Inspect(source.syntax, func(node ast.Node) bool {
		if startsConcurrency(node) {
			lines = append(lines, source.files.Position(node.Pos()).Line)
		}
		return true
	})
	return lines
}

// startsConcurrency matches `go`, channel types, sends and `Go` methods like WaitGroup.Go.
func startsConcurrency(node ast.Node) bool {
	switch typed := node.(type) {
	case *ast.GoStmt, *ast.ChanType, *ast.SendStmt:
		return true
	case *ast.CallExpr:
		selector, isSelector := typed.Fun.(*ast.SelectorExpr)
		return isSelector && selector.Sel.Name == goroutineMethod
	default:
		return false
	}
}

// findPlanLines returns the lines directly below a comment that contains the plan marker.
func findPlanLines(source sourceFile) map[int]bool {
	planLines := make(map[int]bool)
	for _, group := range source.syntax.Comments {
		if strings.Contains(group.Text(), planMarker) {
			planLines[source.files.Position(group.End()).Line+1] = true
		}
	}
	return planLines
}

// findUnplannedConcurrency returns all concurrency lines without a plan comment above them.
func findUnplannedConcurrency(source sourceFile) []int {
	planLines := findPlanLines(source)
	var unplanned []int
	for _, line := range findConcurrencyLines(source) {
		if !planLines[line] {
			unplanned = append(unplanned, line)
		}
	}
	return unplanned
}

func TestEntryPointIsTheOnlyMainPackage(t *testing.T) {
	mainDirs := findMainPackages(loadSourceFiles(t))
	if !mainDirs[entryPointDir] {
		t.Errorf("%s has no main package, found %v", entryPointDir, mainDirs)
	}
	delete(mainDirs, entryPointDir)
	if len(mainDirs) > 0 {
		t.Errorf("only %s may be a main package, also found %v", entryPointDir, mainDirs)
	}
}

// Tests may start goroutines freely, because they end with the test.
func TestProductionConcurrencyHasAPlan(t *testing.T) {
	for _, source := range loadSourceFiles(t) {
		if strings.HasSuffix(source.path, "_test.go") {
			continue
		}
		for _, line := range findUnplannedConcurrency(source) {
			t.Errorf("%s:%d: add a comment starting with %q directly above",
				source.path, line, planMarker)
		}
	}
}

func TestFindUnplannedConcurrency(t *testing.T) {
	testCases := []struct {
		name, body string
		want       int
	}{
		{"plain code", `println("linear")`, 0},
		{"go statement", `go println("x")`, 1},
		{"channel type", `_ = make(chan int)`, 1},
		{"channel send", `var out chan<- int; out <- 1`, 2},
		{"wait group", `var group sync.WaitGroup; group.Go(func() {})`, 1},
		{"planned go", "// Concurrency plan: ends with the call.\ngo println(\"x\")", 0},
		{"planned wait group", "// Concurrency plan: awaited below.\ngroup.Go(func() {})", 0},
		{"other comment", "// Starts a goroutine.\ngo println(\"x\")", 1},
		{"plan too far above", "// Concurrency plan: late.\nprintln()\ngo println(\"x\")", 1},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			code := "package sample\nfunc run() {\n" + testCase.body + "\n}"
			source, err := parseSource("sample.go", code)
			if err != nil {
				t.Fatal(err)
			}
			if got := findUnplannedConcurrency(source); len(got) != testCase.want {
				t.Fatalf("unplanned lines = %v, want %d", got, testCase.want)
			}
		})
	}
}

func TestFindMainPackages(t *testing.T) {
	first, err := parseSource("cmd/one/main.go", "package main")
	if err != nil {
		t.Fatal(err)
	}
	second, err := parseSource("internal/tool/main.go", "package main")
	if err != nil {
		t.Fatal(err)
	}
	library, err := parseSource("internal/store/store.go", "package store")
	if err != nil {
		t.Fatal(err)
	}
	got := findMainPackages([]sourceFile{first, second, library})
	if len(got) != 2 || !got["cmd/one"] || !got["internal/tool"] {
		t.Fatalf("findMainPackages() = %v", got)
	}
}
