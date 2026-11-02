import { useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import ArtworkCard from "../components/ArtworkCard";
import { artworks } from "../data/artworks";
export default function Collection() {
  const [category, setCategory] = useState("All works");
  const [query, setQuery] = useState("");
  const filtered = artworks.filter(
    (a) =>
      (category === "All works" || a.category === category) &&
      `${a.title} ${a.artist}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className="collection-page page-shell">
      <div className="eyebrow">THE OPEN COLLECTION</div>
      <h1>Look a little closer.</h1>
      <div className="collection-page-intro">
        <p>
          A small collection of beautiful things.
          <br />
          Choose a work, find a piece, and stay a while.
        </p>
        <Link to="/solo?upload=1" className="text-link">
          Bring your own photograph <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="collection-toolbar">
        <div className="category-tabs" aria-label="Filter artwork">
          {["All works", "Paintings", "Architecture", "Nature"].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={c === category ? "active" : ""}
              aria-pressed={c === category}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="collection-search">
          <Search size={16} />
          <input
            aria-label="Search by artwork or artist"
            placeholder="Find a work or an artist"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {filtered.length ? (
        <div className="artwork-grid collection-full">
          {filtered.map((a) => (
            <ArtworkCard key={a.id} artwork={a} index={artworks.indexOf(a)} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No works in this corner.</h2>
          <p>Try a different artist or explore the full collection.</p>
          <button
            className="button button-outline"
            onClick={() => {
              setQuery("");
              setCategory("All works");
            }}
          >
            Show all works
          </button>
        </div>
      )}
      <div className="collection-footnote">
        {artworks.length} works, countless little discoveries.{" "}
        <span>Artwork credits are included with every puzzle.</span>
      </div>
    </main>
  );
}
