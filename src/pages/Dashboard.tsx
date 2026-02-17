import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">
        Olá, {user?.user_metadata?.display_name || "Usuário"} 👋
      </h1>
      <p className="mt-2 text-muted-foreground">
        Bem-vindo ao seu painel financeiro. Em breve, aqui estarão seus gráficos e resumos.
      </p>
    </div>
  );
}
