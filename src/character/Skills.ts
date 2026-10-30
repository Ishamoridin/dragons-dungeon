export const SKILL_ATTRIBUTES = [
    'Strength',
    'Dexterity',
    'Constitution',
    'Mental',
    'Social',
    'Mana',
] as const

export type SkillAttribute = (typeof SKILL_ATTRIBUTES)[number]

export type SkillOptions = {
    Name: string
    Value?: number
    Progress?: number
    description: string
    flags?: string[]
    attributes?: SkillAttribute[]
    tier?: number
    subtypes?: Skill[]
}

const clampValue = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.min(100, Math.trunc(value))) : 0

const clampProgress = (progress: number) =>
    Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0

export class Skill {
    public Name: string
    private value: number
    private progress: number
    public description: string
    public flags: string[]
    public attributes: SkillAttribute[]
    public tier: number
    public subtypes: Skill[]

    constructor(options: SkillOptions) {
        this.Name = options.Name
        this.value = clampValue(options.Value ?? 0)
        this.progress = clampProgress(options.Progress ?? 0)
        this.description = options.description
        this.flags = options.flags ?? []
        this.attributes = options.attributes ?? []
        this.tier = options.tier ?? 0
        this.subtypes = options.subtypes ?? []
    }

    public get Value(): number {
        return this.value
    }

    public set Value(value: number) {
        this.value = clampValue(value)
    }

    public get Progress(): number {
        return this.progress
    }

    public set Progress(progress: number) {
        this.progress = clampProgress(progress)
    }
}

const skill = (
    Name: string,
    description: string,
    attributes: SkillAttribute[],
    flags: string[] = [],
    subtypes: Skill[] = [],
) => new Skill({ Name, description, attributes, flags, subtypes })

const manipulationTypes = [
    'Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Ice', 'Light', 'Dark',
    'Poison', 'Acid', 'Psychic', 'Time', 'Space', 'Gravity', 'Sound', 'Plant',
    'Animal', 'Metal', 'Crystal', 'Wood', 'Stone', 'Sand', 'Smoke', 'Shadow',
    'Spirit', 'Blood', 'Bone', 'Flesh', 'Mind', 'Soul', 'Dream', 'Nightmare',
    'Chaos', 'Order', 'Life', 'Death', 'Energy', 'Force', 'Elemental', 'Arcane',
    'Divine', 'Demonic', 'Celestial', 'Astral', 'Void', 'Cosmic', 'Temporal',
    'Spatial', 'Dimensions', 'Probability', 'Reality', 'Perception',
] as const

const manipulationSubtypes = manipulationTypes.map((Name) =>
    skill(
        Name,
        `Shape, direct, and control ${Name.toLowerCase()} through focused manipulation.`,
        ['Mana', 'Mental'],
        ['magic', 'manipulation'],
    ),
)

export const SKILLS: Skill[] = [
    skill('Punch', 'Deliver an unarmed blow with force and accuracy.', ['Strength', 'Dexterity'], ['combat', 'unarmed']),
    skill('Kick', 'Strike with a kick while maintaining balance.', ['Strength', 'Dexterity'], ['combat', 'unarmed']),
    skill('Strike', 'Land a deliberate melee attack with a weapon or natural weapon.', ['Strength', 'Dexterity'], ['combat']),
    skill('Block', 'Absorb or redirect an incoming attack.', ['Strength', 'Constitution'], ['combat', 'defense']),
    skill('Defend', 'Protect yourself or an ally from an immediate threat.', ['Dexterity', 'Constitution'], ['combat', 'defense']),
    skill('Parry', 'Deflect an attack with precise timing.', ['Dexterity', 'Strength'], ['combat', 'defense']),
    skill('Dodge', 'Avoid an attack or hazard through quick movement.', ['Dexterity'], ['combat', 'movement']),
    skill('Throw', 'Throw an object or use leverage to throw an opponent.', ['Strength', 'Dexterity'], ['combat']),
    skill('Grab', 'Seize, hold, or restrain a target.', ['Strength', 'Dexterity'], ['combat', 'grapple']),
    skill('Run', 'Move quickly over distance while managing pace.', ['Dexterity', 'Constitution'], ['movement']),
    skill('Jump', 'Clear gaps and obstacles with a controlled leap.', ['Strength', 'Dexterity'], ['movement']),
    skill('Climb', 'Scale walls, cliffs, and other difficult surfaces.', ['Strength', 'Dexterity'], ['movement']),
    skill('Swim', 'Move through water and stay afloat in rough conditions.', ['Strength', 'Constitution'], ['movement']),
    skill('Crawl', 'Move low through confined or exposed spaces.', ['Dexterity', 'Constitution'], ['movement', 'stealth']),
    skill('Sneak', 'Move quietly without drawing attention.', ['Dexterity', 'Mental'], ['stealth']),
    skill('Hide', 'Conceal yourself or an object from observation.', ['Dexterity', 'Mental'], ['stealth']),
    skill('Search', 'Systematically inspect an area for details or hidden objects.', ['Mental'], ['perception']),
    skill('Track', 'Follow a creature or trail using physical clues.', ['Mental', 'Constitution'], ['perception', 'survival']),
    skill('Listen', 'Identify and interpret sounds nearby.', ['Mental'], ['perception']),
    skill('Speak', 'Communicate clearly and adapt speech to an audience.', ['Social', 'Mental'], ['communication']),
    skill('Read', 'Understand written language, symbols, and context.', ['Mental'], ['knowledge']),
    skill('Write', 'Create clear written records, messages, or accounts.', ['Mental', 'Social'], ['knowledge', 'communication']),
    skill('Cook', 'Prepare food safely and bring out its useful qualities.', ['Mental', 'Dexterity'], ['crafting']),
    skill('Craft', 'Make useful objects from available materials.', ['Dexterity', 'Mental'], ['crafting']),
    skill('Repair', 'Diagnose faults and restore an object to working order.', ['Mental', 'Dexterity'], ['crafting']),
    skill('Heal', 'Treat injuries and stabilize a wounded creature.', ['Mental', 'Dexterity'], ['medicine']),
    skill('Magic', 'Understand and perform general magical techniques.', ['Mana', 'Mental'], ['magic']),
    skill('Alchemy', 'Combine ingredients into useful chemical or magical mixtures.', ['Mental', 'Mana'], ['crafting', 'magic']),
    skill('Enchant', 'Imbue an object with a lasting magical property.', ['Mana', 'Mental'], ['magic', 'crafting']),
    skill('Summon', 'Call a creature or entity through a magical rite.', ['Mana', 'Mental'], ['magic', 'ritual']),
    skill('Control', 'Maintain composure and direct actions under pressure.', ['Mental', 'Constitution'], ['discipline']),
    skill('Focus', 'Sustain attention on a task or source of power.', ['Mental', 'Mana'], ['discipline', 'magic']),
    skill('Compound', 'Combine compatible materials, forces, or effects.', ['Mental', 'Mana'], ['crafting', 'magic']),
    skill('Transmute', 'Transform a substance or property into another form.', ['Mana', 'Mental'], ['magic']),
    skill('Contract', 'Form and uphold a binding agreement or pact.', ['Social', 'Mental'], ['social', 'ritual']),
    skill('Mirror', 'Reflect, imitate, or reproduce an observed quality or effect.', ['Mental', 'Mana'], ['magic', 'perception']),
    skill('Empathy', 'Recognize and understand another person’s emotional state.', ['Social', 'Mental'], ['social', 'perception']),
    skill('Manipulation', 'Shape and direct a chosen force, substance, or concept.', ['Mana', 'Mental'], ['magic', 'manipulation'], manipulationSubtypes),
]

export default SKILLS