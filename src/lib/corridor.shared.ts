export type CorridorStop = {
  zip_prefix: string;
  city_label: string;
  sequence: number;
};

export type CorridorCheck =
  | { level: "ok"; matchedStop: CorridorStop }
  | { level: "warn"; matchedStop: CorridorStop; reason: string }
  | { level: "needs_approval"; matchedStop: CorridorStop; reason: string }
  | { level: "blocked"; reason: string };

/**
 * Verifica se um código postal de entrega encaixa no corredor de uma rota.
 * Função pura: sem acesso a BD, sem side effects, totalmente testável.
 *
 * @param zipCode Código postal da entrega (ex: "5050-123").
 * @param corridor Snapshot ordenado do corredor da rota.
 * @param scheduledSequences Sequences das paragens já agendadas nesta rota.
 * @param bigJumpThreshold Limite de salto que exige aprovação (default: 3).
 */
export function checkCorridor(params: {
  zipCode: string;
  corridor: CorridorStop[];
  scheduledSequences: number[];
  bigJumpThreshold: number;
}): CorridorCheck {
  const { zipCode, corridor, scheduledSequences, bigJumpThreshold } = params;

  // 1. Normaliza o CP: remove espaços e fica com os primeiros 4 dígitos.
  const digits = zipCode.replace(/\s/g, "").slice(0, 4);
  const prefix4 = digits;

  // 2. Encontra a stop do corredor cujo zip_prefix é o prefixo mais longo
  //    que prefix4 começa por. Entre vários matches, ganha o mais específico.
  let matchedStop: CorridorStop | undefined;

  for (const stop of corridor) {
    const prefix = stop.zip_prefix;
    if (prefix4.startsWith(prefix)) {
      if (!matchedStop || prefix.length > matchedStop.zip_prefix.length) {
        matchedStop = stop;
      }
    }
  }

  // 3. Sem match → bloqueia.
  if (!matchedStop) {
    return {
      level: "blocked",
      reason: `CP ${prefix4} não pertence ao corredor desta rota`,
    };
  }

  const seq = matchedStop.sequence;

  // 4. Se ainda não há entregas agendadas, qualquer match do corredor é ok.
  if (scheduledSequences.length === 0) {
    return { level: "ok", matchedStop };
  }

  // 5. Calcula o salto mínimo até às sequences já agendadas.
  const jumps = scheduledSequences.map((s) => Math.abs(seq - s));
  const minJump = Math.min(...jumps);

  const minSeq = Math.min(...scheduledSequences);
  const maxSeq = Math.max(...scheduledSequences);
  const insideRange = seq >= minSeq && seq <= maxSeq;

  if (minJump <= 2) {
    if (insideRange) {
      return { level: "ok", matchedStop };
    }

    return {
      level: "warn",
      matchedStop,
      reason: `Esta paragem (${matchedStop.city_label}, posição ${seq}) estende ligeiramente o corredor já agendado`,
    };
  }

  return {
    level: "needs_approval",
    matchedStop,
    reason: `Esta paragem (${matchedStop.city_label}, posição ${seq}) fica afastada das paragens já agendadas e pode obrigar a um desvio grande`,
  };
}
