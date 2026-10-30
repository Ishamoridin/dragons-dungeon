import Strength from './Attributes/Strength'
import Dexterity from './Attributes/Dexterity'
import Constitution from './Attributes/Constitution'
import Mental from './Attributes/Mental'
import Social from './Attributes/Social'
import Mana from './Attributes/Mana'
import type { Attribute } from './Attribute'
import { COMMONER, PlayerClass, type PrimaryAttributeName } from './PlayerClass'
import type { DM, User } from './User'
import type { Augmentation, EquipmentItem, InventoryItem, Injury } from './CharacterOptions'
import type { EssenceTechnique } from './essence/EssenceTypes'

type PersonSnapshot = {
    Name: string
    Level: number
    owner: User
    DM: DM
    CampaignName: string
    Tags: string[]
    XP: number
    Inventory: InventoryItem[]
    Equipment: EquipmentItem[]
    Injury: Injury[]
    Augmentation: Augmentation[]
    PlayerClass: PlayerClass
    Attributes: Record<PrimaryAttributeName, Attribute>
}

export default class Person {
    public Name: string
    public Level = 1
    public owner: User
    public DM: DM
    public CampaignName: string
    public Tags: string[] = []
    public XP = 0
    public Inventory: InventoryItem[] = []
    public Equipment: EquipmentItem[] = []
    public Injury: Injury[] = []
    public Augmentation: Augmentation[] = []
    public Techniques: EssenceTechnique[] = []
    public PlayerClass: PlayerClass
    public Strength: Attribute
    public Dexterity: Attribute
    public Constitution: Attribute
    public Mental: Attribute
    public Social: Attribute
    public Mana: Attribute
    private levelHistory: PersonSnapshot[] = []

    constructor(
        owner: User,
        dm: DM,
        campaignName = 'Unassigned',
        playerClass: PlayerClass = COMMONER,
        name = 'Hero',
    ) {
        this.Name = name
        this.owner = owner
        this.DM = dm
        this.CampaignName = campaignName
        this.PlayerClass = playerClass
        this.Strength = new Strength();
        this.Dexterity = new Dexterity();
        this.Constitution = new Constitution();
        this.Mental = new Mental();
        this.Social = new Social();
        this.Mana = new Mana();
    }

    public LevelUp(): void {
        this.levelHistory.push(this.createSnapshot())
        this.Level += 1
        this.getAttributeEntries().forEach(([name, attribute]) => {
            this.adjustLeafValues(attribute, this.PlayerClass.GrowthFor(name))
        })
        this.recalculateDerivedValues()
    }

    public LevelDown(): void {
        const previous = this.levelHistory.pop()
        if (!previous) {
            return
        }

        this.Level = previous.Level
        this.Name = previous.Name
        this.owner = previous.owner
        this.DM = previous.DM
        this.CampaignName = previous.CampaignName
        this.Tags = [...previous.Tags]
        this.XP = previous.XP
        this.Inventory = structuredClone(previous.Inventory)
        this.Equipment = structuredClone(previous.Equipment)
        this.Injury = structuredClone(previous.Injury)
        this.Augmentation = structuredClone(previous.Augmentation)
        this.PlayerClass = previous.PlayerClass
        this.Strength = previous.Attributes.Strength
        this.Dexterity = previous.Attributes.Dexterity
        this.Constitution = previous.Attributes.Constitution
        this.Mental = previous.Attributes.Mental
        this.Social = previous.Attributes.Social
        this.Mana = previous.Attributes.Mana
    }

    public ModifySubAttribute(rootAttribute: Attribute, index: number, change: number): void {
        const subAttribute = rootAttribute.subAttributes?.[index]
        if (!subAttribute || subAttribute.subAttributes?.length) {
            return
        }

        subAttribute.value = Math.max(1, Math.min(1000, subAttribute.value + change))
        this.recalculateDerivedValues()
    }

    private getAttributeEntries(): [PrimaryAttributeName, Attribute][] {
        return [
            ['Strength', this.Strength],
            ['Dexterity', this.Dexterity],
            ['Constitution', this.Constitution],
            ['Mental', this.Mental],
            ['Social', this.Social],
            ['Mana', this.Mana],
        ]
    }

    private createSnapshot(): PersonSnapshot {
        const attributes = Object.fromEntries(
            this.getAttributeEntries().map(([name, attribute]) => [name, this.cloneAttribute(attribute)]),
        ) as Record<PrimaryAttributeName, Attribute>

        return {
            Name: this.Name,
            Level: this.Level,
            owner: this.owner,
            DM: this.DM,
            CampaignName: this.CampaignName,
            Tags: [...this.Tags],
            XP: this.XP,
            Inventory: structuredClone(this.Inventory),
            Equipment: structuredClone(this.Equipment),
            Injury: structuredClone(this.Injury),
            Augmentation: structuredClone(this.Augmentation),
            PlayerClass: new PlayerClass(this.PlayerClass.Name, { ...this.PlayerClass.AttributeGrowth }),
            Attributes: attributes,
        }
    }

    private cloneAttribute(attribute: Attribute): Attribute {
        return {
            ...attribute,
            subAttributes: attribute.subAttributes?.map((subAttribute) => this.cloneAttribute(subAttribute)),
        }
    }

    private adjustLeafValues(root: Attribute, change: number): void {
        const adjustLeaves = (attribute: Attribute): void => {
            if (!attribute.subAttributes?.length) {
                attribute.value = Math.max(1, Math.min(1000, attribute.value + change))
                return
            }

            attribute.subAttributes.forEach(adjustLeaves)
        }

        adjustLeaves(root)
    }

    private recalculateDerivedValues(): void {
        const recalculate = (attribute: Attribute): number => {
            const children = attribute.subAttributes
            if (!children?.length) {
                return attribute.value
            }

            const values = children.map(recalculate)
            attribute.value = Math.sqrt(
                values.reduce((sum, value) => sum + value * value, 0) / values.length,
            )
            return attribute.value
        }

        this.getAttributeEntries().forEach(([, attribute]) => recalculate(attribute))
    }
}