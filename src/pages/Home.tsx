import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Plus, MoveUpRight } from "lucide-react";
import { artworks } from "../data/artworks";
import ArtworkCard from "../components/ArtworkCard";
const categories = ["All works", "Paintings", "Architecture", "Nature"];
export default function Home() {
  const [category, setCategory] = useState("All works");
  const visible = artworks
    .filter((a) => category === "All works" || a.category === category)
    .slice(0, 3);
  return (
    <>
      <main>
        <section className="hero page-shell">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-cross">+</span> THE ART OF COMING TOGETHER
            </div>
            <h1>
              Good things
              <br />
              come together<span className="hero-period">.</span>
            </h1>
            <p className="hero-description">
              A quiet place to connect, one piece at a time.
              <br className="desktop-break" /> Beautiful puzzles. Your favorite
              people. No rush.
            </p>
            <div className="hero-actions">
              <Link className="button button-dark" to="/create">
                Create a room <Plus size={17} />
              </Link>
              <Link className="hero-join text-link" to="/join">
                Join with a code <ArrowUpRight size={17} />
              </Link>
            </div>
            <Link className="solo-link" to="/solo">
              Or, enjoy a little time on your own <ArrowRight size={15} />
            </Link>
            <div className="hero-facts">
              <span>2–6 people</span>
              <i />
              <span>12–120 pieces</span>
              <i />
              <span>No account needed</span>
            </div>
          </div>
          <div className="hero-exhibit">
            <div className="exhibit-top">
              <span>A MOMENT, PIECE BY PIECE</span>
              <span>EXHIBIT 001</span>
            </div>
            <div className="exhibit-image">
              <img
                src="/art/museum.png"
                alt="A quiet museum gallery, filled with art and afternoon light"
                fetchPriority="high"
              />
              <div className="exhibit-corner corner-tl" />
              <div className="exhibit-corner corner-br" />
              <div className="floating-note">
                <svg viewBox="0 0 40 40" aria-hidden="true">
                  <path
                    d="M4 4h11v5a5 5 0 1 0 10 0V4h11v11h-5a5 5 0 1 0 0 10h5v11H25v-5a5 5 0 1 0-10 0v5H4V25h5a5 5 0 1 0 0-10H4Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
                <span>
                  There’s a place
                  <br />
                  for every piece.
                </span>
              </div>
            </div>
            <div className="exhibit-caption">
              <span>Less scrolling. More connecting.</span>
              <span className="exhibit-caption-right">
                A shared experience <MoveUpRight size={12} />
              </span>
            </div>
          </div>
        </section>
        <div className="intro-divider page-shell">
          <span>AN OPEN INVITATION TO SLOW DOWN</span>
          <span>
            SCROLL TO EXPLORE <span className="down-arrow">↓</span>
          </span>
        </div>
        <section className="collection-section page-shell" id="collection">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">01 / THE COLLECTION</div>
              <h2>Find your next piece.</h2>
            </div>
            <Link to="/collection" className="text-link collection-all">
              Explore the collection <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="collection-toolbar">
            <div className="category-tabs" aria-label="Filter collection">
              {categories.map((c) => (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                >
                  {c}
                </button>
              ))}
            </div>
            <span className="collection-note">
              Art worth spending time with.
            </span>
          </div>
          <div
            className={`artwork-grid ${visible.length === 1 ? "single-work" : ""}`}
          >
            {visible.map((a, i) => (
              <ArtworkCard
                key={a.id}
                artwork={a}
                index={artworks.indexOf(a) === -1 ? i : artworks.indexOf(a)}
              />
            ))}
          </div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="page-shell how-inner">
            <div className="how-heading">
              <div className="eyebrow">02 / A SIMPLE PLEASURE</div>
              <h2>
                No rules to learn.
                <br />
                Just pieces to find.
              </h2>
              <p>
                Like gathering around the same table.
                <br />
                Even when you’re a little far apart.
              </p>
              <Link to="/create" className="text-link">
                Make room for your people <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="how-steps">
              <article>
                <span>01</span>
                <div>
                  <h3>Pick something beautiful.</h3>
                  <p>
                    Choose a work from the collection, or bring a photograph of
                    your own.
                  </p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>Pull up a chair.</h3>
                  <p>
                    Open a private room and share the six-character code with up
                    to five friends.
                  </p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <h3>Find where you fit.</h3>
                  <p>
                    Move the pieces. Share the small victories. There’s no timer
                    to beat.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>
        <section className="closing page-shell">
          <span className="eyebrow">A LITTLE LESS APART.</span>
          <h2>
            One picture.
            <br />A few good people.
          </h2>
          <Link to="/create" className="button button-dark">
            Start something together <ArrowUpRight size={17} />
          </Link>
          <p>Free to play. A pleasure to share.</p>
        </section>
      </main>
    </>
  );
}
