import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Artwork } from "../lib/types";
export default function ArtworkCard({
  artwork,
  index = 0,
}: {
  artwork: Artwork;
  index?: number;
}) {
  return (
    <Link to={`/solo?art=${artwork.id}`} className="artwork-card">
      <div className="artwork-image">
        <img
          src={artwork.image}
          alt={`${artwork.title} by ${artwork.artist}`}
          loading="lazy"
        />
        <span className="artwork-open">
          Piece this together <ArrowUpRight size={17} />
        </span>
        <span className="artwork-number">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div className="artwork-caption">
        <div>
          <h3>{artwork.title}</h3>
          <p>
            {artwork.artist}, {artwork.year}
          </p>
        </div>
        <ArrowUpRight className="artwork-arrow" size={21} strokeWidth={1.3} />
      </div>
      <div className="artwork-meta">
        <span>{artwork.category}</span>
        <span>12 / 48 / 120 pieces</span>
      </div>
    </Link>
  );
}
