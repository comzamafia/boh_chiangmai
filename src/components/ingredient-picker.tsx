"use client";

/**
 * IngredientPicker
 * A searchable, grouped popover that replaces the flat <Select> in recipe builder.
 *
 * Groups (in order):
 *   🥩 Protein       — meat, seafood, eggs, tofu
 *   🥬 Produce        — fresh vegetables & herbs
 *   🌶️ Chili & Spice — chili, pepper, galangal, lemongrass, kaffir, ginger
 *   🫙 Sauce & Oil    — liquid condiments, pastes, oils, sugar, vinegar
 *   🌾 Dry & Noodle  — dried goods, noodles, rice, flour, coconut milk
 *   📦 Other          — anything unclassified
 *
 * If an ingredient has a real DB category (from V2 IngredientCategory),
 * that name is used as its group label instead.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { Popover } from "radix-ui";
import { Search, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Ingredient } from "@/lib/api";
import { useCurrency } from "@/components/currency-context";

// ─── Keyword-based fallback grouping ─────────────────────────────────────────
const PROTEIN_KEYS   = ["chicken","shrimp","prawn","tiger","beef","pork","duck","fish","crab","squid","tofu","egg","salmon","tuna","scallop","clam","mussel","lobster","abalone","frog","venison","lamb","goat"];
const PRODUCE_KEYS   = ["spinach","kale","cabbage","bok choy","broccoli","cauliflower","carrot","bean sprout","spring onion","scallion","onion","shallot","garlic","tomato","eggplant","mushroom","zucchini","cucumber","lettuce","celery","leek","asparagus","corn","pea","pepper","capsicum","avocado","papaya","mango","lime","lemon","lime leaf","basil","mint","coriander","cilantro","parsley","dill","spring","herb","vegetable","veg "];
const CHILI_KEYS     = ["chili","chilli","chile","pepper corn","peppercorn","galangal","lemongrass","kaffir","ginger","turmeric","bird eye","bird's eye","paprika"];
const SAUCE_KEYS     = ["sauce","oil","paste","sugar","vinegar","tamarind","fish sauce","oyster","soy","kecap","hoisin","sriracha","sambal","nam prik","prik","molasses","honey","syrup","cream","butter","margarine","condensed","evaporated","stock","broth"];
const DRY_KEYS       = ["noodle","rice","flour","starch","powder","dried","dry","coconut milk","coconut cream","bread","bun","wrap","tortilla","dumpling","wonton","spring roll","tofu skin","vermicelli","glass noodle","egg noodle","udon","ramen","pasta","spaghetti","fettuccine","bean","lentil","chickpea","dal","quinoa","oat","corn flake","cereal","nut","almond","cashew","peanut","sesame","sunflower","walnut","pistachio","seed","spice","cumin","coriander seed","cardamom","cinnamon","clove","star anise","bay leaf","thyme","oregano","rosemary","basil dried","chili flake","msg","salt","baking"];

function detectGroup(ing: Ingredient): string {
    // If the ingredient has a real DB category, use it
    if (ing.category?.name) return ing.category.name;

    const lower = ing.name.toLowerCase();
    if (PROTEIN_KEYS.some(k => lower.includes(k)))  return "🥩 Protein";
    if (CHILI_KEYS.some(k => lower.includes(k)))    return "🌶️ Chili & Spice";
    if (PRODUCE_KEYS.some(k => lower.includes(k)))  return "🥬 Produce";
    if (SAUCE_KEYS.some(k => lower.includes(k)))    return "🫙 Sauce & Oil";
    if (DRY_KEYS.some(k => lower.includes(k)))      return "🌾 Dry & Noodle";
    return "📦 Other";
}

// Default group display order (DB categories will be inserted alphabetically before "📦 Other")
const DEFAULT_ORDER = ["🥩 Protein", "🥬 Produce", "🌶️ Chili & Spice", "🫙 Sauce & Oil", "🌾 Dry & Noodle", "📦 Other"];

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
    ingredients: Ingredient[];
    value: string;             // selected ingredientId
    onChange: (id: string) => void;
    className?: string;
}

export function IngredientPicker({ ingredients, value, onChange, className }: Props) {
    const [open, setOpen]     = useState(false);
    const [search, setSearch] = useState("");
    const searchRef           = useRef<HTMLInputElement>(null);
    const { format }          = useCurrency();

    const selected = ingredients.find(i => i.id === value);

    // Focus search input when popover opens
    useEffect(() => {
        if (open) {
            setTimeout(() => searchRef.current?.focus(), 50);
        } else {
            setSearch("");
        }
    }, [open]);

    // ─── Group & filter ───────────────────────────────────────────────────────
    const grouped = useMemo(() => {
        const term = search.toLowerCase().trim();
        const filtered = term
            ? ingredients.filter(i =>
                i.name.toLowerCase().includes(term) ||
                (i.supplier?.name ?? "").toLowerCase().includes(term) ||
                (i.category?.name ?? "").toLowerCase().includes(term)
              )
            : ingredients;

        const map = new Map<string, Ingredient[]>();
        for (const ing of filtered) {
            const g = detectGroup(ing);
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(ing);
        }

        // Sort each group alphabetically
        map.forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));

        // Order: known groups first, then any DB categories alphabetically, then Other
        const knownOrder = DEFAULT_ORDER.filter(g => map.has(g) && g !== "📦 Other");
        const dbGroups   = [...map.keys()].filter(g => !DEFAULT_ORDER.includes(g)).sort();
        const other      = map.has("📦 Other") ? ["📦 Other"] : [];

        return [...knownOrder, ...dbGroups, ...other].map(g => ({ group: g, items: map.get(g)! }));
    }, [ingredients, search]);

    const totalFiltered = grouped.reduce((s, g) => s + g.items.length, 0);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            {/* ── Trigger ── */}
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 h-9 text-sm shadow-xs transition-colors",
                        "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        !selected && "text-muted-foreground",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-1.5 flex-1 min-w-0 text-left">
                        {selected ? (
                            <>
                                <span className="truncate font-medium">{selected.name}</span>
                                <span className="text-muted-foreground text-xs shrink-0">/ {selected.recipeUnit}</span>
                            </>
                        ) : (
                            "Select ingredient…"
                        )}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
            </Popover.Trigger>

            {/* ── Dropdown panel ── */}
            <Popover.Portal>
                <Popover.Content
                    sideOffset={4}
                    align="start"
                    className={cn(
                        "z-50 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                        "data-[side=bottom]:slide-in-from-top-2"
                    )}
                >
                    {/* Search */}
                    <div className="flex items-center border-b px-3 py-2 gap-2 sticky top-0 bg-popover rounded-t-lg">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Search ingredients…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                className="text-muted-foreground hover:text-foreground text-xs"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Grouped list */}
                    <div className="max-h-72 overflow-y-auto p-1">
                        {totalFiltered === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                No ingredients found.
                            </p>
                        ) : (
                            grouped.map(({ group, items }) => (
                                <div key={group}>
                                    {/* Group header */}
                                    <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground select-none">
                                        {group}
                                        <span className="ml-1.5 font-normal normal-case tracking-normal opacity-60">({items.length})</span>
                                    </div>

                                    {/* Items */}
                                    {items.map(ing => {
                                        const effCost = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
                                        const isSelected = ing.id === value;
                                        return (
                                            <button
                                                key={ing.id}
                                                type="button"
                                                onClick={() => { onChange(ing.id); setOpen(false); }}
                                                className={cn(
                                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                                    "hover:bg-accent hover:text-accent-foreground",
                                                    isSelected && "bg-primary/10 text-primary font-medium"
                                                )}
                                            >
                                                {/* Check mark for selected */}
                                                <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100 text-primary" : "opacity-0")} />

                                                {/* Name */}
                                                <span className="flex-1 truncate">{ing.name}</span>

                                                {/* Unit + cost */}
                                                <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                                                    <span className="block">{ing.recipeUnit}</span>
                                                    <span className="block text-[10px] opacity-70">{format(effCost, 4)}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer count */}
                    {search && (
                        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                            {totalFiltered} result{totalFiltered !== 1 ? "s" : ""}
                        </div>
                    )}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
