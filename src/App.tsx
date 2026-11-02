import { ArrowUpRight } from "lucide-react";
import { Component, lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Collection from "./pages/Collection";
import About from "./pages/About";
const Solo = lazy(() => import("./pages/Solo"));
const CreateRoom = lazy(() =>
  import("./pages/Rooms").then((module) => ({ default: module.CreateRoom })),
);
const JoinRoom = lazy(() =>
  import("./pages/Rooms").then((module) => ({ default: module.JoinRoom })),
);
const Lobby = lazy(() =>
  import("./pages/Rooms").then((module) => ({ default: module.Lobby })),
);
const MultiplayerGame = lazy(() =>
  import("./pages/Rooms").then((module) => ({
    default: module.MultiplayerGame,
  })),
);
const Results = lazy(() =>
  import("./pages/Rooms").then((module) => ({ default: module.Results })),
);
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? (
      <main className="not-found">
        <h1>A piece is out of place.</h1>
        <p>
          We couldn’t load this page. Your saved solo progress is kept in this
          browser.
        </p>
        <button
          className="button button-dark"
          onClick={() => window.location.assign("/")}
        >
          Return to the collection
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <div id="main-content">
        <Suspense
          fallback={
            <main className="status-message" role="status">
              Opening your gallery…
            </main>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/solo" element={<Solo />} />
            <Route path="/about" element={<About />} />
            <Route path="/create" element={<CreateRoom />} />
            <Route path="/join" element={<JoinRoom />} />
            <Route path="/room/:roomCode/lobby" element={<Lobby />} />
            <Route path="/room/:roomCode/game" element={<MultiplayerGame />} />
            <Route path="/room/:roomCode/results" element={<Results />} />
            <Route
              path="*"
              element={
                <main className="not-found">
                  <div className="eyebrow">404 / OUTSIDE THE EXHIBITION</div>
                  <h1>A little off the beaten path.</h1>
                  <p>Let’s find your way back to the collection.</p>
                  <Link className="button button-dark" to="/">
                    Back to the gallery <ArrowUpRight size={15} />
                  </Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </div>
      <Footer />
    </ErrorBoundary>
  );
}
