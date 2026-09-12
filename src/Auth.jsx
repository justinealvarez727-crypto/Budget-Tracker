import React, { useState } from "react";
import { Wallet } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Account created. If email confirmation is on, check your inbox before signing in.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#241A12",
        backgroundImage: "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1.4px)",
        backgroundSize: "3px 3px",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#F4E9D0",
          backgroundImage: "radial-gradient(rgba(43,27,14,0.035) 1px, transparent 1.4px)",
          backgroundSize: "3px 3px",
          color: "#2B1B0E",
          borderRadius: 10,
          padding: "2rem 1.75rem",
          width: "100%",
          maxWidth: 380,
          border: "1px solid rgba(43,27,14,0.18)",
          boxShadow: "0 12px 26px -16px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, #a23636, #7A1F1F 70%)",
              color: "#F4E9D0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 5px rgba(0,0,0,0.4), inset 0 -2px 3px rgba(0,0,0,0.3), inset 0 2px 2px rgba(255,255,255,0.18)",
              position: "relative",
              transform: "rotate(-8deg)",
            }}
          >
            <Wallet size={18} />
          </div>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 21, fontWeight: 600 }}>Ledger</span>
        </div>

        <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p style={{ fontSize: 13, color: "#6B4A2E", marginBottom: 18 }}>
          {mode === "signin" ? "Sign in to see your accounts and budgets." : "Set a password to start tracking your money."}
        </p>

        <form onSubmit={submit}>
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.03em", color: "#6B4A2E", marginBottom: 4 }}>
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block", marginBottom: 18 }}>
            <span style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.03em", color: "#6B4A2E", marginBottom: 4 }}>
              Password
            </span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              style={inputStyle}
            />
          </label>

          {errorMsg && <p style={{ fontSize: 12, color: "#A13A1F", marginBottom: 12 }}>{errorMsg}</p>}
          {message && <p style={{ fontSize: 12, color: "#5C7A52", marginBottom: 12 }}>{message}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 6,
              border: "none",
              background: "#5C7A52",
              color: "#F3F5EF",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
              boxShadow: "0 3px 0 #33452C",
            }}
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setErrorMsg(null);
            setMessage(null);
          }}
          style={{
            marginTop: 16,
            background: "none",
            border: "none",
            fontSize: 13,
            color: "#6B4A2E",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#EADFC4",
  border: "1px solid rgba(43,27,14,0.18)",
  borderRadius: 6,
  padding: "9px 10px",
  fontSize: 14,
  color: "#2B1B0E",
  boxSizing: "border-box",
};
