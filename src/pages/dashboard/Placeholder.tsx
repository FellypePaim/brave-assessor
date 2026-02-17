import { useLocation } from "react-router-dom";

export default function Placeholder() {
  const { pathname } = useLocation();
  const name = pathname.split("/").pop() || "Página";
  const title = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-muted-foreground">Esta funcionalidade será implementada em breve.</p>
    </div>
  );
}
