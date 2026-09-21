import { Navigate, Route, Routes } from "react-router-dom";
import CookieBanner from "./components/CookieBanner";
import { PartyFx } from "./components/PartyArt";
import Seo from "./components/Seo";
import SiteFooter from "./components/SiteFooter";
import AchievementsPage from "./pages/AchievementsPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import FriendsPage from "./pages/FriendsPage";
import Landing from "./pages/Landing";
import LegalPage from "./pages/LegalPage";
import ProfilePage from "./pages/ProfilePage";
import ResetPage from "./pages/ResetPage";
import RoomPage from "./pages/RoomPage";
import StatsPage from "./pages/StatsPage";
import VerifyPage from "./pages/VerifyPage";

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Seo />
      <PartyFx />
      <div id="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<LegalPage doc="privacy" />} />
          <Route path="/terms" element={<LegalPage doc="terms" />} />
          <Route path="/cookies" element={<LegalPage doc="cookies" />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="/account" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/account/stats" element={<StatsPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/account/password" element={<ChangePasswordPage />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <SiteFooter />
      <CookieBanner />
    </>
  );
}
