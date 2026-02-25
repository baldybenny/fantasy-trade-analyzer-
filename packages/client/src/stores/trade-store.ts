import { create } from 'zustand';
import type { Player, TradeAnalysis } from '@fta/shared';

interface TradeSideState {
  teamId: number | null;
  players: Player[];
}

interface TradeStore {
  sideA: TradeSideState;
  sideB: TradeSideState;
  analysis: TradeAnalysis | null;
  isAnalyzing: boolean;

  setTeamA: (teamId: number) => void;
  setTeamB: (teamId: number) => void;
  addPlayerToA: (player: Player) => void;
  addPlayerToB: (player: Player) => void;
  removePlayerFromA: (playerId: number) => void;
  removePlayerFromB: (playerId: number) => void;
  setAnalysis: (analysis: TradeAnalysis | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  reset: () => void;
}

const initialSide: TradeSideState = { teamId: null, players: [] };

export const useTradeStore = create<TradeStore>((set) => ({
  sideA: { ...initialSide },
  sideB: { ...initialSide },
  analysis: null,
  isAnalyzing: false,

  setTeamA: (teamId) =>
    set({ sideA: { teamId, players: [] }, analysis: null }),
  setTeamB: (teamId) =>
    set({ sideB: { teamId, players: [] }, analysis: null }),

  addPlayerToA: (player) =>
    set((state) => ({
      sideA: { ...state.sideA, players: [...state.sideA.players, player] },
      analysis: null,
    })),
  addPlayerToB: (player) =>
    set((state) => ({
      sideB: { ...state.sideB, players: [...state.sideB.players, player] },
      analysis: null,
    })),

  removePlayerFromA: (playerId) =>
    set((state) => ({
      sideA: {
        ...state.sideA,
        players: state.sideA.players.filter((p) => p.id !== playerId),
      },
      analysis: null,
    })),
  removePlayerFromB: (playerId) =>
    set((state) => ({
      sideB: {
        ...state.sideB,
        players: state.sideB.players.filter((p) => p.id !== playerId),
      },
      analysis: null,
    })),

  setAnalysis: (analysis) => set({ analysis }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  reset: () =>
    set({
      sideA: { ...initialSide },
      sideB: { ...initialSide },
      analysis: null,
      isAnalyzing: false,
    }),
}));
