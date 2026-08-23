import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components";
import {
  DiscoverPage,
  EventDetailPage,
  EventFormPage,
  EventsPage,
  LobbiesPage,
  LobbyDetailPage,
  LobbyFormPage,
  NotFoundPage,
  ProfilePage,
} from "./pages";
import { RealtimeSync } from "./queries";

export default function App() {
  return (
    <>
      <RealtimeSync />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DiscoverPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/new" element={<EventFormPage />} />
          <Route path="events/:id" element={<EventDetailPage />} />
          <Route path="events/:id/bearbeiten" element={<EventFormPage />} />
          <Route path="lobbies" element={<LobbiesPage />} />
          <Route path="lobbies/neu" element={<LobbyFormPage />} />
          <Route path="lobbies/:id" element={<LobbyDetailPage />} />
          <Route path="me" element={<ProfilePage />} />
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
