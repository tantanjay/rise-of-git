import { CivilizationType } from "@/types";
import { CIV_MODIFIERS, StatModifier } from "./civDemographics";
import { CIV_BOSS_DAMAGE, MOONWELL, MOONWELL_TRAIT } from "./war";

/**
 * Each civilization's Unique Trait: the story behind its standing buffs and debuffs (`CIV_MODIFIERS`).
 * Flavour only — the numbers live in server/src/warConfig.ts and its client mirror.
 */
export interface UniqueTrait {
  name: string;
  /** Short line under the name */
  motto: string;
  /** The legend that explains the buffs and debuffs */
  story: string;
  /** Why a single modifier is the way it is (keyed by `StatModifier.id`); others are covered by the story */
  notes?: Record<string, string>;
  /** Plain words on the numbers behind the legend */
  behind?: string;
  /** Why it copes with one world disaster and suffers from another (GAME_GUIDE §10 *World Disasters*) */
  disasters: { copes: string; suffers: string };
}

export const UNIQUE_TRAITS: Record<CivilizationType, UniqueTrait> = {
  elf: {
    name: "Echoes of the Thousand Years",
    motto: "Every ranger is a veteran of a hundred wars.",
    story:
      "An elf soldier was already old when the human kingdoms were founded. There are so few elves that every ranger has fought a hundred wars, and every arrow carries centuries of practice. That is why one elf is worth five to ten soldiers of the younger races, and why they fight hardest in their own glades.",
    behind:
      "At City Hall 10 an elf fields 140 soldiers against 800 human footmen or 700 orcs, so each elf has to count for many — and the Moonwell gives back half of those who fall in battle.",
    notes: {
      moonwell_healers:
        "No elf is left on a battlefield. Their healers carry the fallen home to the Moonwell, where the silver water closes a few more wounds with every turn of the watch; a ruler who pours out emeralds into the well can wake them sooner. A race this few cannot spend its people the way the younger kingdoms do.",
      elf_boss_share:
        "An elven archer has watched the old colossi wake and sleep for a thousand years, and knows where the hide wears thin. A volley that would bounce off a mountain finds the one soft seam in it."
    },
    disasters: {
      copes: "Tempest Roads: rangers who have walked the same paths for centuries keep their feet in any gale.",
      suffers: "Blood Moon: the glades remember the last red moon, and the war it brought; their archers' hands shake under it."
    }
  },
  arcane: {
    name: "The Unbound Accord",
    motto: "The Voidrift stands outside the world's laws.",
    story:
      "The people of the Voidrift are neither born nor do they age; they are bound to the rift itself, and the rift lends its strength to whatever it holds. Theirs is the one buff that needs no reason: Nethergarde is the exception.",
    disasters: {
      copes: "Wasting Plague: constructs of the void have no blood to sicken.",
      suffers: "Barren Spell: the spell starves the rift itself, and the Void Well gives back only half its fallen."
    }
  },
  human: {
    name: "The Banner of Many Hands",
    motto: "Humans win by being many, and by being fed.",
    story: "No human soldier is a match for an orc berserker or an elf ranger. But humans are many, they march as one, and their armies never go hungry.",
    notes: {
      massed_levies:
        "When the rift first opened, every village sent its sons under the Dawn Banner. Facing the void, humans still march as one sworn host.",
      grain_fed_hosts:
        "Orc warbands live off what they raid and starve within weeks. A human army marches behind full grain wagons and outlasts them, so it hits hardest when it carries the war into the Badlands."
    },
    disasters: {
      copes: "Barren Spell: the Dawn Banner's blessing keeps the cradles of Valoria rocking when every other land falls silent.",
      suffers: "Great Blight: the many hands are fed on grain, and a blighted field feeds no host."
    }
  },
  dwarf: {
    name: "Oath of the Mountain Halls",
    motto: "Matchless behind stone and against the horde; slow and uneasy elsewhere.",
    story: "A dwarf swears to hold the mountain, not to leave it. Behind their own walls and against their oldest foe they are unbreakable; out on the plains, and against the void, the oath weighs on them.",
    notes: {
      anvil_vs_horde: "A thousand years of orc raids on the passes taught every clan to meet a charge with a shield wall.",
      break_the_charge: "A thousand years of orc raids on the passes taught every clan to meet a charge with a shield wall.",
      stone_ramparts: "In their halls, every wall is a weapon.",
      slow_advance: "Dwarves don't leave the mountain gladly; on open plains their march loses heart.",
      void_dulled_steel: "Their rune-forged steel was made for this world, and void flesh drinks its edge.",
      dwarf_boss_share: "The oldest runes on dwarven steel were cut in the giant wars, before there were orcs to fight; against a colossus they wake again."
    },
    disasters: {
      copes: "Great Blight: the halls eat from mushroom caverns and stone granaries no rot can reach.",
      suffers: "Tempest Roads: heavy armour sinks deep in a gale-churned mud road."
    }
  },
  orc: {
    name: "Blood of Drak'mar",
    motto: "Orcs fight on fury and numbers, and that fury needs something to break.",
    story: "An orc warband runs on rage: the louder the enemy screams, the harder it hits. Against anything that bleeds and fears, that fury is enough.",
    notes: {
      frenzy_breaks:
        "A berserker's rage feeds on the enemy's fear and pain. The Void Weavers feel neither, and the frenzy breaks against them.",
      orc_boss_share:
        "The war-drums that drive a horde mean nothing to a colossus: it neither fears nor bleeds the way a foe should, and the frenzy breaks on its hide."
    },
    disasters: {
      copes: "Blood Moon: the warbands howl back at the red moon and fight all the harder under it.",
      suffers: "Wasting Plague: a crowded war camp is a plague's feast."
    }
  }
};

/** The buffs and debuffs a civilization's Unique Trait explains, each with its lore line when it has one (its world-boss share and Moonwell last) */
export function traitModifiers(civ: CivilizationType): Array<StatModifier & { lore?: string }> {
  const notes = UNIQUE_TRAITS[civ].notes ?? {};
  const boss = CIV_BOSS_DAMAGE[civ];
  const bossMod: StatModifier[] = boss ? [{ id: `${civ}_boss_share`, name: boss.name, kind: boss.mult < 1 ? "debuff" : "buff", description: boss.description }] : [];
  // 🌙 Moonwell Healers: a share of the battle's fallen come home wounded (warConfig MOONWELL)
  const woundMod: StatModifier[] = MOONWELL.CIVS.includes(civ) ? [{ id: "moonwell_healers", name: MOONWELL_TRAIT.name, kind: "buff", description: MOONWELL_TRAIT.description }] : [];
  return [...CIV_MODIFIERS[civ], ...bossMod, ...woundMod].map((m) => ({ ...m, lore: notes[m.id] }));
}
