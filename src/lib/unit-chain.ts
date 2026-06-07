/**
 * unit-chain.ts — flexible multi-level unit conversion for the Usage Report.
 *
 * A chain is a base unit + a list of relations "1 <from> = <qty> <to>".
 * Example (Soft Shell Crab, base = Piece):
 *   1 Case = 4 Box · 1 Box = 6 Crab · 1 Crab = 2 Piece · 1 Order = 5 Piece · 1 Order = 8 oz
 * The solver reduces every unit to the base (Piece) so the report can show the
 * same quantity as Order / oz / Piece / Box / Case and convert between them.
 */

export interface UnitRelation { from: string; qty: number; to: string } // 1 <from> = qty <to>
export interface UnitChain { base: string; relations: UnitRelation[] }

const norm = (s: string) => s.trim();

/** perBase[unit] = how many BASE units are in 1 of <unit>. */
export function solveChain(chain: UnitChain): Record<string, number> {
    const perBase: Record<string, number> = {};
    if (!chain?.base) return perBase;
    perBase[norm(chain.base)] = 1;
    const rels = (chain.relations ?? [])
        .map(r => ({ from: norm(r.from), to: norm(r.to), qty: Number(r.qty) }))
        .filter(r => r.from && r.to && Number.isFinite(r.qty) && r.qty > 0);

    let changed = true, guard = 0;
    while (changed && guard++ < 200) {
        changed = false;
        for (const r of rels) {
            if (perBase[r.to] != null && perBase[r.from] == null)      { perBase[r.from] = r.qty * perBase[r.to]; changed = true; }
            else if (perBase[r.from] != null && perBase[r.to] == null) { perBase[r.to]   = perBase[r.from] / r.qty; changed = true; }
        }
    }
    return perBase;
}

/** All unit names referenced by the chain (base first, then in declaration order). */
export function unitNames(chain: UnitChain): string[] {
    const out: string[] = [norm(chain.base)];
    const seen = new Set(out);
    for (const r of chain?.relations ?? []) {
        for (const u of [norm(r.from), norm(r.to)]) {
            if (u && !seen.has(u)) { seen.add(u); out.push(u); }
        }
    }
    return out;
}

/** Units that are fully solvable to the base (usable for display). */
export function solvableUnits(chain: UnitChain): string[] {
    const perBase = solveChain(chain);
    return unitNames(chain).filter(u => perBase[u] != null);
}

/** Convert qty in <from> → <to> using a solved perBase map. Null if not solvable. */
export function convertUnit(qty: number, from: string, to: string, perBase: Record<string, number>): number | null {
    const f = perBase[norm(from)], t = perBase[norm(to)];
    if (f == null || t == null || t === 0) return null;
    return (qty * f) / t;
}

/** Format a converted quantity with sensible precision. */
export function fmtChainQty(n: number): string {
    if (!Number.isFinite(n)) return "—";
    if (n === 0) return "0";
    const abs = Math.abs(n);
    const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });
}
