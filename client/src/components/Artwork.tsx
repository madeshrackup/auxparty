export default function Artwork({
  src,
  spinning,
  blurred,
}: {
  src?: string;
  spinning?: boolean;
  blurred?: boolean;
}) {
  return (
    <div className={`vinyl ${spinning ? "spin" : ""}`}>
      {src ? (
        <img className={`art ${blurred ? "blur" : ""}`} src={src} alt="" />
      ) : (
        <div className="art" />
      )}
    </div>
  );
}
