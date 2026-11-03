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
        I made this website for two reasons: to appreciate art more, and to give
        people something to share even when they're far apart. Whether you're a
        couple across time zones, friends who miss game nights, or someone who
        simply enjoys a puzzle on their own, there's a seat for you at this
        table.
      </p>

      <p>
        This design borrows from a museum visit: an open room, thoughtful
        labels, and enough space to look closely. The art takes the spotlight.
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

      <h2>Thank you</h2>
      <p>
        To my girlfriend, who inspires me to make things like this: thank you for
        showing me that the best moments are the ones we make room for. This
        one's for you.
      </p>

      <Link to="/collection" className="button button-dark">
        Step into the collection <ArrowUpRight size={15} />
      </Link>
    </main>
  );
}