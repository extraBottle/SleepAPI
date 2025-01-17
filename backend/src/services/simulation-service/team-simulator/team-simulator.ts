/**
 * Copyright 2024 Sleep API Authors
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

import { TeamMember, TeamSettingsExt } from '@src/domain/combination/team';
import { CookingState } from '@src/services/simulation-service/team-simulator/cooking-state';
import { MemberState, SkillActivation } from '@src/services/simulation-service/team-simulator/member-state';
import { getDefaultMealTimes } from '@src/utils/meal-utils/meal-utils';
import { TimeUtils } from '@src/utils/time-utils/time-utils';
import { CalculateTeamResponse, Time, TimePeriod } from 'sleepapi-common';

export class TeamSimulator {
  private run = 0;

  private memberStates: MemberState[] = [];
  private cookingState;

  private timeIntervals: Time[] = [];
  private dayPeriod: TimePeriod;
  private nightPeriod: TimePeriod;
  private nightStartMinutes: number;
  private mealTimes: number[];
  private cookedMealsCounter = 0;
  private fullDayDuration = 1440;
  private energyDegradeCounter = -1; // -1 so it takes 3 iterations and first degrade is after 10 minutes, then 10 minutes between each

  constructor(params: { settings: TeamSettingsExt; members: TeamMember[] }) {
    const { settings, members } = params;

    this.cookingState = new CookingState(settings.camp);

    const dayPeriod = {
      start: settings.wakeup,
      end: settings.bedtime,
    };
    this.dayPeriod = dayPeriod;
    const nightPeriod = {
      start: settings.bedtime,
      end: settings.wakeup,
    };
    this.nightPeriod = nightPeriod;

    let next5Minutes = settings.wakeup;
    while (TimeUtils.timeWithinPeriod(next5Minutes, this.dayPeriod)) {
      this.timeIntervals.push(next5Minutes);
      next5Minutes = TimeUtils.addTime(next5Minutes, { hour: 0, minute: 5, second: 0 });
    }
    next5Minutes = settings.bedtime;
    while (TimeUtils.timeWithinPeriod(next5Minutes, this.nightPeriod)) {
      this.timeIntervals.push(next5Minutes);
      next5Minutes = TimeUtils.addTime(next5Minutes, { hour: 0, minute: 5, second: 0 });
    }

    this.nightStartMinutes = TimeUtils.timeToMinutesSinceStart(this.nightPeriod.start, this.dayPeriod.start);

    const mealTimes = getDefaultMealTimes(dayPeriod);
    this.mealTimes = mealTimes.map((time) => TimeUtils.timeToMinutesSinceStart(time, this.dayPeriod.start));

    for (const member of members) {
      const memberState = new MemberState({ member, team: members, settings, cookingState: this.cookingState });
      this.memberStates.push(memberState);
    }
  }

  public simulate() {
    this.init();

    let minutesSinceWakeup = 0;
    // Day loop
    while (minutesSinceWakeup <= this.nightStartMinutes) {
      this.attemptCooking(minutesSinceWakeup);

      for (const member of this.memberStates) {
        const teamSkillActivated = member.attemptDayHelp(minutesSinceWakeup);
        if (teamSkillActivated) {
          this.activateTeamSkill(teamSkillActivated);
        }
      }

      this.maybeDegradeEnergy();
      minutesSinceWakeup += 5;
    }

    this.collectInventory();

    // Night loop
    while (minutesSinceWakeup <= this.fullDayDuration) {
      for (const member of this.memberStates) {
        member.attemptNightHelp(minutesSinceWakeup);
      }

      this.maybeDegradeEnergy();
      minutesSinceWakeup += 5;
    }
  }

  public results(): CalculateTeamResponse {
    const members = this.memberStates.map((m) => m.results(this.run));
    const cooking = this.cookingState.results(this.run);

    return { members, cooking };
  }

  private init() {
    for (const member of this.memberStates) {
      const morningSkills = member.startDay();
      for (const proc of morningSkills) {
        this.activateTeamSkill(proc);
      }
    }

    this.energyDegradeCounter = -1;
    this.cookedMealsCounter = 0;
    this.run++;
  }

  private attemptCooking(currentMinutesSincePeriodStart: number) {
    if (currentMinutesSincePeriodStart >= this.mealTimes[this.cookedMealsCounter]) {
      for (const member of this.memberStates) {
        member.updateIngredientBag();
        member.recoverMeal();
      }
      // mod 7 for if Sunday
      this.cookingState.cook(this.run % 7 === 0);
      this.cookedMealsCounter++;
    }
  }

  private maybeDegradeEnergy() {
    // degrade energy every 10 minutes, so every 2nd chunk of 5 minutes
    if (++this.energyDegradeCounter >= 2) {
      this.energyDegradeCounter = 0;
      for (const member of this.memberStates) {
        member.degradeEnergy();
      }
    }
  }

  private activateTeamSkill(result: SkillActivation) {
    if (result.helpsTeam > 0) {
      for (const mem of this.memberStates) {
        mem.addHelps(result.helpsTeam);
      }
    } else if (result.energyTeam > 0) {
      for (const mem of this.memberStates) {
        mem.recoverEnergy(result.energyTeam);
      }
    }
  }

  private collectInventory() {
    for (const member of this.memberStates) {
      member.collectInventory();
    }
  }
}
