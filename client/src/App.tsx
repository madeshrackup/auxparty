import { Navigate, Route, Routes } from "react-router-dom";
import { PartyFx } from "./components/PartyArt";
import Landing from "./pages/Landing";
import RoomPage from "./pages/RoomPage";

export default function App() {
  return (
    <>
      <PartyFx />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
