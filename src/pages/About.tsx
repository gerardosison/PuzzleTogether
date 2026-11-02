import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
export default function About() {
  return (
    <main className="about-page page-shell">
      <div className="eyebrow">A NOTE FROM THE TABLE</div>
      <h1>
        Make a little
        <br />
        room for each other.
      </h1>
      <p>
        PuzzleTogether is a quiet place to spend time with a picture—and the
        people you like. There are no leaderboards, no streaks to keep, and no
        hurry to finish.
      </p>
      <p>
        Our design borrows from a museum visit: an open room, thoughtful labels,
        and enough space to look closely. The art takes the spotlight.
      </p>
      <h2>A few things to know</h2>
      <p>
        Solo puzzles run in your browser and save progress on this device.
        Private multiplayer rooms use Supabase; the host must configure that
        service before shared play is available. You never need a traditional
        account: connected rooms use a guest identity.
      </p>
      <p>
        Your uploaded photographs stay on your device in solo mode. Clearing
        browser storage removes saved solo progress. Guest identities are tied
        to the browser where they were created.
      </p>
      <Link to="/collection" className="button button-dark">
        Step into the collection <ArrowUpRight size={15} />
      </Link>
    </main>
  );
}
