/**
 * Copyright 2023 Sleep API Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { OptimalTeamSolution } from '@src/domain/combination/combination';
import { CustomPokemonCombinationWithProduce } from '@src/domain/combination/custom';
import { ProgrammingError } from '@src/domain/error/programming/programming-error';
import { hashPokemonCombination } from '@src/utils/optimal-utils/optimal-utils';
import { IngredientSet } from 'sleepapi-common';
import {
  calculateRemainingSimplifiedIngredients,
  createMemoKey,
  parseMemoKey,
  sumOfSimplifiedIngredients,
} from '../../utils/set-cover-utils/set-cover-utils';
import {
  calculateRemainingIngredients,
  combineSameIngredientsInDrop,
  extractRelevantSurplus,
  sortByMinimumFiller,
} from '../calculator/ingredient/ingredient-calculate';

export interface SimplifiedIngredientSet {
  amount: number;
  ingredient: string;
}
export interface MemoizedParameters {
  remainingIngredients: SimplifiedIngredientSet[];
  spotsLeftInTeam: number;
}

export class SetCover {
  #reverseIndex: Map<string, CustomPokemonCombinationWithProduce[]> = new Map();
  #memo: Map<string, CustomPokemonCombinationWithProduce[][]>;
  #startTime: number = Date.now();
  #timeout = 10000;

  constructor(
    reverseIndex: Map<string, CustomPokemonCombinationWithProduce[]>,
    memo: Map<string, CustomPokemonCombinationWithProduce[][]>
  ) {
    this.#reverseIndex = reverseIndex;
    this.#memo = memo;
  }

  public solveRecipe(params: string): CustomPokemonCombinationWithProduce[][] {
    if (this.checkTimeout()) {
      return [];
    }

    const cachedSolution = this.#memo.get(params);
    if (cachedSolution) {
      return cachedSolution;
    }

    const memoizedParams: MemoizedParameters = parseMemoKey(params);
    const { spotsLeftInTeam, remainingIngredients: mealIngredients } = memoizedParams;
    if (spotsLeftInTeam === 0 || mealIngredients.length === 0) {
      return [];
    }

    let maxTeamSize = spotsLeftInTeam;

    // Take the first un-fulfilled ingredient requirement
    const firstIngredient = mealIngredients[0];

    // For each pokemon that produces the ingredient, go through and
    // determine how many ingredients remain in the recipe if we add
    // that pokemon to our team
    const remainders: [number, SimplifiedIngredientSet[], CustomPokemonCombinationWithProduce][] = [];
    const pokemonWithIngredient = this.#reverseIndex.get(firstIngredient.ingredient) ?? [];
    for (let i = 0, len = pokemonWithIngredient.length; i < len; i++) {
      const remainder: SimplifiedIngredientSet[] = calculateRemainingSimplifiedIngredients(
        mealIngredients,
        pokemonWithIngredient[i].detailedProduce.produce.ingredients,
        true
      );
      const sum = sumOfSimplifiedIngredients(remainder);
      remainders.push([sum, remainder, pokemonWithIngredient[i]]);
    }
    // Sort the possible teams by quantity of remaining ingredients
    remainders.sort((a, b) => a[0] - b[0]);

    let teams: CustomPokemonCombinationWithProduce[][] = [];
    for (let i = 0, len = remainders.length; i < len; i++) {
      const [sumr, remainder, poke] = remainders[i];
      if (sumr > 0) {
        // If there are remaining ingredients after adding this pokemon,
        // and we haven't hit the team size limit, recurse and solve for
        // the remaining ingredients
        if (maxTeamSize > 1) {
          const updatedParams: MemoizedParameters = {
            remainingIngredients: remainder,
            spotsLeftInTeam: maxTeamSize - 1,
          };
          const key = createMemoKey(updatedParams);

          const subTeams: CustomPokemonCombinationWithProduce[][] = this.solveRecipe(key);
          this.#memo.set(key, subTeams); // expand memo since we didnt have this solve yet

          if (!subTeams) {
            throw new ProgrammingError(
              'Should not happen since we check maxTeamSize > 1, and we return only undefined for 0'
            );
          }
          if (subTeams.length == 0) {
            // If there are no teams that can solve the remaining ingredients
            // within our team size limit, just move on
            continue;
          }
          const subTeamSize = subTeams[0].length;

          if (subTeamSize + 1 < maxTeamSize) {
            // If our new team solves the recipe and is smaller than our current
            // best team, clear out our list of top teams, add the current
            // pokemon to each subteam, then add all subteams to the list of
            // best teams
            teams = subTeams.map((s) => s.concat(poke)).sort();
            maxTeamSize = subTeamSize + 1;
          } else if (subTeamSize + 1 === maxTeamSize) {
            // If the subteams plus our pokemon are the same size as the current
            // best team, add all subteams
            teams = teams.concat(subTeams.map((s) => s.concat(poke)).sort());
          }
        } else {
          // hit the team limit
          continue;
        }
      } else {
        // Our pokemon solves the remaining ingredients all by itself
        if (maxTeamSize > 1) {
          // If the best current team is bigger than one,
          // remove them all and replace with just our pokemon
          teams = [[poke]];
          maxTeamSize = 1;
        } else if (maxTeamSize === 1) {
          // If the best current team is also size one,
          // add our pokemon as another team
          teams = teams.concat([[poke]]);
        }
      }
    }

    this.#memo.set(params, teams);
    return teams;
  }

  private checkTimeout() {
    if (Date.now() - this.#startTime > this.#timeout) {
      return true;
    }
    return false;
  }

  public calculateDetailsAndSortBySumSurplus(
    solutions: CustomPokemonCombinationWithProduce[][],
    recipe: IngredientSet[]
  ): OptimalTeamSolution[] {
    if (!solutions) {
      return [];
    }

    const exhaustive = !this.checkTimeout();

    const teamsWithDetails: OptimalTeamSolution[] = [];
    for (const team of solutions) {
      const teamsProduce = team.flatMap((member) => member.detailedProduce.produce.ingredients);
      const totalSurplus = calculateRemainingIngredients(combineSameIngredientsInDrop(teamsProduce), recipe);
      const surplus = extractRelevantSurplus(recipe, totalSurplus);
      const teamWithDetails: OptimalTeamSolution = {
        team: team,
        surplus,
        exhaustive,
      };

      teamsWithDetails.push(teamWithDetails);
    }

    const sortedByFiller = sortByMinimumFiller(teamsWithDetails, recipe);
    return this.processOptimalTeamSolutions(sortedByFiller);
  }

  public processOptimalTeamSolutions(optimalTeamSolutions: OptimalTeamSolution[]): OptimalTeamSolution[] {
    optimalTeamSolutions.forEach((solution) => {
      solution.team.sort((a, b) =>
        hashPokemonCombination(a.pokemonCombination).localeCompare(hashPokemonCombination(b.pokemonCombination))
      );
    });

    return this.removeDuplicateTeams(optimalTeamSolutions);
  }

  public removeDuplicateTeams(optimalTeamSolutions: OptimalTeamSolution[]): OptimalTeamSolution[] {
    const uniqueTeamHashes = new Set<string>();
    return optimalTeamSolutions.filter((solution) => {
      const teamHash = solution.team.map((pc) => hashPokemonCombination(pc.pokemonCombination)).join('|');
      if (uniqueTeamHashes.has(teamHash)) {
        return false;
      } else {
        uniqueTeamHashes.add(teamHash);
        return true;
      }
    });
  }

  public findOptimalCombinationFor(
    recipe: IngredientSet[],
    maxTeamSize?: number,
    timeout?: number
  ): OptimalTeamSolution[] {
    this.#startTime = Date.now();
    this.#timeout = timeout ?? this.#timeout;

    const spotsLeftInTeam = maxTeamSize ?? 5;

    const params: MemoizedParameters = {
      remainingIngredients: recipe.map((ing) => ({
        amount: ing.amount,
        ingredient: ing.ingredient.name,
      })),
      spotsLeftInTeam,
    };

    const key = createMemoKey(params);
    const solutions = this.#memo.get(key) ?? this.solveRecipe(key);

    return this.calculateDetailsAndSortBySumSurplus(solutions, recipe) ?? [];
  }

  public calculateMinTeamSizeFor(recipe: IngredientSet[], maxTeamSize?: number, timeout?: number) {
    this.#startTime = Date.now();
    this.#timeout = timeout ?? this.#timeout;

    const spotsLeftInTeam = maxTeamSize ?? 5;

    const params: MemoizedParameters = {
      remainingIngredients: recipe.map((ing) => ({
        amount: ing.amount,
        ingredient: ing.ingredient.name,
      })),
      spotsLeftInTeam: spotsLeftInTeam,
    };

    const key = createMemoKey(params);
    const solutions = this.#memo.get(key) ?? this.solveRecipe(key);

    return solutions.at(0) ? solutions[0].length : spotsLeftInTeam + 1;
  }
}
