import CompareStrength from '@/components/compare/compare-strength.vue'
import { useComparisonStore } from '@/stores/comparison-store/comparison-store'
import type { SingleProductionExt } from '@/types/member/instanced'
import { createMockPokemon } from '@/vitest'
import { VueWrapper, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { berry, berryPowerForLevel, ingredient } from 'sleepapi-common'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

describe('CompareStrength', () => {
  let wrapper: VueWrapper<InstanceType<typeof CompareStrength>>

  const mockMemberProduction: SingleProductionExt = {
    member: createMockPokemon({ name: 'Ash' }),
    ingredients: [
      {
        amount: 10,
        ingredient: ingredient.FANCY_APPLE
      },
      {
        amount: 20,
        ingredient: ingredient.HONEY
      }
    ],
    skillProcs: 5,
    berries: {
      amount: 100,
      berry: berry.BELUE
    },
    ingredientPercentage: 0.2,
    skillPercentage: 0.02,
    carrySize: 10,
    averageEnergy: 10,
    averageFrequency: 10,
    dayHelps: 10,
    nightHelps: 10,
    nrOfHelps: 10,
    sneakySnackHelps: 10,
    spilledIngredients: [],
    totalRecovery: 10
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    wrapper = mount(CompareStrength, {})
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  it('renders correctly with initial data', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('renders member data correctly', async () => {
    const comparisonStore = useComparisonStore()
    comparisonStore.addMember(mockMemberProduction)

    await nextTick()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)

    const firstRowCells = rows[0].findAll('td')
    expect(firstRowCells.length).toBe(5)

    expect(firstRowCells[0].text()).toContain('Ash')

    // Check berry power
    const berryPower =
      berryPowerForLevel(
        mockMemberProduction.member.pokemon.berry,
        mockMemberProduction.member.level
      ) * (mockMemberProduction.berries?.amount ?? 1)
    expect(firstRowCells[1].text()).toContain(berryPower.toString())

    // Check ingredient power range
    const lowestIngredientValue = wrapper.vm.lowestIngredientPower(mockMemberProduction)
    const highestIngredientValue = wrapper.vm.highestIngredientPower(mockMemberProduction)

    const ingredientPower = firstRowCells[2].text()
    expect(ingredientPower).toContain(lowestIngredientValue)
    expect(ingredientPower).toContain(highestIngredientValue)

    // Check skill value
    const skillValue = wrapper.vm.skillValue(mockMemberProduction)
    expect(firstRowCells[3].text()).toContain(skillValue)

    // Check total power
    expect(firstRowCells[4].text()).toContain(berryPower + highestIngredientValue + skillValue)
  })

  it('displays the correct number of headers', () => {
    const headers = wrapper.findAll('thead th')
    expect(headers.length).toBe(5)
    expect(headers[0].text()).toBe('Name')
    expect(headers[1].text()).toBe('Berry')
    expect(headers[2].text()).toBe('Ingredient')
    expect(headers[3].text()).toBe('Skill')
    expect(headers[4].text()).toBe('Total (max)')
  })
})