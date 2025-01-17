import { BALANCED_GENDER } from 'src/domain';
import { describe, expect, it } from 'vitest';
import { BELUE } from '../../domain/berry';
import { SLOWPOKE_TAIL } from '../../domain/ingredient';
import { HELPER_BOOST } from '../../domain/mainskill';
import { Pokemon } from '../../domain/pokemon';
import { evolvesFrom, evolvesInto } from './evolution-utils';

const MOCK_POKEMON: Pokemon = {
  name: 'Mockemon',
  specialty: 'berry',
  frequency: 0,
  ingredientPercentage: 0,
  skillPercentage: 0,
  berry: BELUE,
  genders: BALANCED_GENDER,
  carrySize: 0,
  previousEvolutions: 1,
  remainingEvolutions: 1,
  ingredient0: { amount: 0, ingredient: SLOWPOKE_TAIL },
  ingredient30: [{ amount: 0, ingredient: SLOWPOKE_TAIL }],
  ingredient60: [{ amount: 0, ingredient: SLOWPOKE_TAIL }],
  skill: HELPER_BOOST,
};

describe('evolvesFrom', () => {
  it('shall have 1 fewer remaining evolution', () => {
    expect(evolvesFrom(MOCK_POKEMON).remainingEvolutions).toBe(0);
  });

  it('shall have 1 more previous evolution', () => {
    expect(evolvesFrom(MOCK_POKEMON).previousEvolutions).toBe(2);
  });
});

describe('evolvesInto', () => {
  it('shall have 1 more remaining evolution', () => {
    expect(evolvesInto(MOCK_POKEMON).remainingEvolutions).toBe(2);
  });

  it('shall have 1 fewer previous evolution', () => {
    expect(evolvesInto(MOCK_POKEMON).previousEvolutions).toBe(0);
  });
});
