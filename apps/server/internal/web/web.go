// Package web serves the browser pages. Sources are in `web/`, the build output is embedded.
package web

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
)

//go:generate go tool esbuild ../../web/stage/index.html ../../web/stage/main.ts ../../web/stage/page.css ../../web/admin/index.html ../../web/admin/main.ts ../../web/admin/page.css --bundle --minify --target=es2022 --loader:.html=copy --loader:.glsl=text --loader:.glb=dataurl --outbase=../../web --outdir=dist --log-level=warning

const (
	// Scripts, styles and requests stay on this server, even if a player name holds markup.
	contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self'; " +
		"img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; " +
		"frame-ancestors 'none'"
	distDir = "dist"
)

// builtFiles holds the build output. Without a build it has only `.gitkeep`, and pages answer 404.
//
//go:embed all:dist
var builtFiles embed.FS

// listPagePatterns returns the routes with a page. Everything else stays private to the embed.
func listPagePatterns() []string {
	return []string{"GET /stage/", "GET /admin/"}
}

// NewHandler serves the embedded pages.
func NewHandler() (http.Handler, error) {
	files, err := fs.Sub(builtFiles, distDir)
	if err != nil {
		return nil, fmt.Errorf("open built pages: %w", err)
	}
	return NewFileHandler(files), nil
}

// NewFileHandler serves the pages from `files`, with the security headers on every response.
func NewFileHandler(files fs.FS) http.Handler {
	mux := http.NewServeMux()
	fileServer := http.FileServerFS(files)
	for _, pattern := range listPagePatterns() {
		mux.Handle(pattern, fileServer)
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		headers := writer.Header()
		headers.Set("Content-Security-Policy", contentSecurityPolicy)
		headers.Set("X-Content-Type-Options", "nosniff")
		// The stage key is part of the link and must not leak to other sites.
		headers.Set("Referrer-Policy", "no-referrer")
		headers.Set("Cache-Control", "no-cache")
		mux.ServeHTTP(writer, request)
	})
}
