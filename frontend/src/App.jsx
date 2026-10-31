import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import VideoChat from "./pages/VideoChat.jsx";
import TextChat from "./pages/TextChat.jsx";
import PrivateChat from "./pages/PrivateChat.jsx";
import { Privacy, Terms, Guidelines, NotFound } from "./pages/Legal.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/video" element={<VideoChat />} />
        <Route path="/text" element={<TextChat />} />
        <Route path="/private" element={<PrivateChat />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/guidelines" element={<Guidelines />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
