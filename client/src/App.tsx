import { Navigate, Route, Routes } from "react-router-dom";
import { PartyFx } from "./components/PartyArt";
import Landing from "./pages/Landing";
import RoomPage from "./pages/RoomPage";
import VerifyPage from "./pages/VerifyPage";

export default function App() {
  return (
    <>
      <PartyFx />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
