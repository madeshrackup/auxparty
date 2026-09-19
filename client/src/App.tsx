import { Navigate, Route, Routes } from "react-router-dom";
import { PartyFx } from "./components/PartyArt";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import FriendsPage from "./pages/FriendsPage";
import Landing from "./pages/Landing";
import ProfilePage from "./pages/ProfilePage";
import ResetPage from "./pages/ResetPage";
import RoomPage from "./pages/RoomPage";
import StatsPage from "./pages/StatsPage";
import VerifyPage from "./pages/VerifyPage";

export default function App() {
  return (
    <>
      <PartyFx />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/account" element={<ProfilePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/account/stats" element={<StatsPage />} />
        <Route path="/account/password" element={<ChangePasswordPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
