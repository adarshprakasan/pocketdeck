export type Stage = "starting" | "ready" | "waiting" | "request" | "approved" | "connecting" | "connected" | "expired" | "rejected" | "error";

export type PairingState = {
  stage: Stage;
  hint: string | null;
  device: string;
  code: string | null;
  expiresAt: number | null;
  origins: string[];
  origin: string | null;
};

export type PairingAction =
  | { type: "stage"; stage: Stage; hint?: string | null }
  | { type: "hint"; hint: string | null }
  | { type: "created"; expiresAt: number | null; origins: string[] }
  | { type: "waiting"; code: string | null }
  | { type: "request"; device: string; code: string | null }
  | { type: "origin"; origin: string }
  | { type: "reset" };

export const initialPairingState: PairingState = { stage: "starting", hint: null, device: "Phone browser", code: null, expiresAt: null, origins: [], origin: null };

const terminal: Stage[] = ["expired", "rejected"];

export function pairingReducer(state: PairingState, action: PairingAction): PairingState {
  switch (action.type) {
    case "stage": {
      // A late "connecting" event must not demote a live connection, and a generic error must not hide
      // the more specific reason a session ended.
      if (action.stage === "connecting" && state.stage === "connected") return state;
      if (action.stage === "error" && terminal.includes(state.stage)) return state;
      return { ...state, stage: action.stage, hint: action.hint === undefined ? state.hint : action.hint };
    }
    case "hint":
      return { ...state, hint: action.hint };
    case "created":
      return { ...state, stage: "ready", expiresAt: action.expiresAt, origins: action.origins, origin: state.origin && action.origins.includes(state.origin) ? state.origin : action.origins[0] ?? null };
    case "waiting":
      return { ...state, stage: "waiting", code: action.code };
    case "request":
      return { ...state, stage: "request", device: action.device, code: action.code };
    case "origin":
      return { ...state, origin: action.origin };
    case "reset":
      return initialPairingState;
  }
}
