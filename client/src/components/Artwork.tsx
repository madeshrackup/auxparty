export default function Artwork({
  src,
  spinning,
  blurred,
  alt,
}: {
  src?: string;
  spinning?: boolean;
  blurred?: boolean;
  alt?: string;
}) {
  const label = blurred ? "Hidden album artwork" : alt || "Album artwork";
  const safeSrc = src && /^https:\/\//i.test(src) ? src : undefined;
  return (
    <div className={`vinyl ${spinning ? "spin" : ""}`}>
      {safeSrc ? (
        <img className={`art ${blurred ? "blur" : ""}`} src={safeSrc} alt={label} decoding="async" />
      ) : (
        <div className="art" />
      )}
    </div>
  );
}
