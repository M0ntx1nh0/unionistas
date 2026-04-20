import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    }
    setIsSubmitting(false);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <img className="login-crest" src="/escudo/unionistar.png" alt="Unionistas de Salamanca CF" />
        <div className="brand-kicker">Área de Scouting</div>
        <h1>Unionistas Scouting Lab</h1>
        <p>Acceso privado al laboratorio de scouting, calendario operativo y campogramas.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Usuario
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ramon@..."
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Contraseña
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
