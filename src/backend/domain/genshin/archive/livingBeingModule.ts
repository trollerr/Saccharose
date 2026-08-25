import { GenshinControl, GenshinControlState } from '../genshinControl.ts';
import {
  AnimalCodexExcelConfigData, AnimalDescribeExcelConfigData, LivingBeingArchive, LivingBeingArchiveGroup,
  LivingBeingLoadConf,
  MonsterDescribeExcelConfigData,
  MonsterExcelConfigData,
} from '../../../../shared/types/genshin/monster-types.ts';
import { defaultMap } from '../../../../shared/util/genericUtil.ts';
import { LangCode } from '../../../../shared/types/lang-types.ts';
import { fsExists } from '../../../util/fsutil.ts';
import { rtrim } from '../../../../shared/util/stringUtil.ts';
import { IMAGEDIR_GENSHIN_EXT } from '../../../loadenv.ts';
import path from 'node:path';

export class GenshinLivingBeingModule {
  constructor(readonly ctrl: GenshinControl) {}

  get knex() {
    return this.ctrl.knex;
  }

  get outputLangCode(): LangCode {
    return this.ctrl.outputLangCode;
  }

  get state(): GenshinControlState {
    return this.ctrl.state;
  }

  // region Monster
  private async postProcessMonster(monster: MonsterExcelConfigData, loadConf?: LivingBeingLoadConf): Promise<MonsterExcelConfigData> {
    if (!monster) {
      return monster;
    }
    if (!loadConf) {
      loadConf = {};
    }
    if (!this.state.DisableMonsterCache) {
      this.state.monsterCache[monster.Id] = monster;
    }
    if (monster.DescribeId) {
      const [r1, r2, r3] = await Promise.all([
        this.selectMonsterDescribe(monster.DescribeId),
        this.selectAnimalDescribe(monster.DescribeId),
        this.selectAnimalCodexByDescribeId(monster.DescribeId, loadConf)
      ]);
      monster.MonsterDescribe = r1;
      monster.AnimalDescribe = r2;
      monster.AnimalCodex = r3;

      monster.Describe = monster.MonsterDescribe || monster.AnimalDescribe;
    }
    if (loadConf.LoadHomeWorldAnimal) {
      monster.HomeWorldAnimal = await this.ctrl.selectHomeWorldAnimalByMonster(monster);
    }
    if (loadConf.LoadModelArtPath && !!monster?.AnimalCodex?.ModelPath) {
      let modelPath = monster.AnimalCodex.ModelPath;

      if (await fsExists(path.resolve(IMAGEDIR_GENSHIN_EXT, `./UI_${modelPath}.png`))) {
        monster.AnimalCodex.ModelArtPath = 'UI_' + modelPath;
      } else {
        modelPath = rtrim(monster.AnimalCodex.ModelPath, '_0123456789');
        if (await fsExists(path.resolve(IMAGEDIR_GENSHIN_EXT, `./UI_${modelPath}.png`))) {
          monster.AnimalCodex.ModelArtPath = 'UI_' + modelPath;
        }
      }
    }
    return monster;
  }

  private async selectMonsterDescribe(describeId: number): Promise<MonsterDescribeExcelConfigData> {
    if (this.state.monsterDescribeCache[describeId]) {
      return this.state.monsterDescribeCache[describeId];
    }

    const describe: MonsterDescribeExcelConfigData = await this.knex.select('*').from('MonsterDescribeExcelConfigData')
      .where({Id: describeId})
      .first().then(this.ctrl.commonLoadFirst);

    this.state.monsterDescribeCache[describeId] = describe;

    if (describe && describe.TitleId) {
      describe.Title = await this.knex.select('*').from('MonsterTitleExcelConfigData')
        .where({TitleId: describe.TitleId})
        .first().then(this.ctrl.commonLoadFirst);
    }

    if (describe && describe.SpecialNameLabId) {
      describe.SpecialNameLabList = await this.knex.select('*').from('MonsterSpecialNameExcelConfigData')
        .where({SpecialNameLabId: describe.SpecialNameLabId})
        .then(this.ctrl.commonLoad);
    }

    return describe;
  }

  async selectMonsterById(id: number, loadConf?: LivingBeingLoadConf): Promise<MonsterExcelConfigData> {
    if (this.state.monsterCache[id]) {
      return this.state.monsterCache[id];
    }

    let monster: MonsterExcelConfigData = await this.knex.select('*').from('MonsterExcelConfigData')
      .where({Id: id})
      .first().then(this.ctrl.commonLoadFirst)
      .then(x => this.postProcessMonster(x, loadConf));

    if (monster && !this.state.DisableMonsterCache) {
      this.state.monsterCache[monster.Id] = monster;
    }

    return monster;
  }

  async selectMonstersByDescribeId(describeId: number, loadConf?: LivingBeingLoadConf): Promise<MonsterExcelConfigData[]> {
    return await this.knex.select('*').from('MonsterExcelConfigData')
      .where({DescribeId: describeId}).then(this.ctrl.commonLoad).then(ret => ret.asyncMap(x => this.postProcessMonster(x, loadConf)));
  }

  async selectAllMonster(loadConf?: LivingBeingLoadConf): Promise<MonsterExcelConfigData[]> {
    return await this.knex.select('*').from('MonsterExcelConfigData')
      .then(this.ctrl.commonLoad).then(ret => ret.asyncMap(x => this.postProcessMonster(x, loadConf)));
  }
  // endregion

  // region Living Beings / Animals
  private async postProcessAnimalCodex(codex: AnimalCodexExcelConfigData, loadConf: LivingBeingLoadConf): Promise<AnimalCodexExcelConfigData> {
    if (!codex) {
      return codex;
    }
    this.state.animalCodexCache[codex.Id] = codex;
    this.state.animalCodexDCache[codex.DescribeId] = codex;

    if (!codex.Type) {
      codex.Type = 'CODEX_WILDLIFE';
    }
    if (!codex.SubType) {
      codex.SubType = 'CODEX_SUBTYPE_ELEMENTAL';
    }

    const [r1, r2, r3] = await Promise.all([
      this.selectAnimalDescribe(codex.DescribeId),
      this.selectMonsterDescribe(codex.DescribeId),
      this.selectMonstersByDescribeId(codex.DescribeId, loadConf)
    ]);

    codex.AnimalDescribe = r1;
    codex.MonsterDescribe = r2;
    codex.Monsters = r3;

    const codexTextMap = await this.selectAnimalCodexManualTextMap();
    codex.SubTypeName = codexTextMap[codex.SubType.replace('CODEX_SUBTYPE', 'UI_CODEX_ANIMAL_CATEGORY')];

    if (codex.Type === 'CODEX_WILDLIFE') {
      codex.Icon = codex.AnimalDescribe?.Icon;
      codex.NameText = codex.AnimalDescribe?.NameText;
      codex.NameTextMapHash = codex.AnimalDescribe?.NameTextMapHash;
      codex.TypeName = codexTextMap['UI_CODEX_ANIMAL_ANIMAL'];
    } else {
      codex.Icon = codex.MonsterDescribe?.Icon;
      codex.NameText = codex.MonsterDescribe?.NameText;
      codex.NameTextMapHash = codex.MonsterDescribe?.NameTextMapHash;
      codex.TypeName = codexTextMap['UI_CODEX_ANIMAL_MONSTER'];
    }

    if (loadConf.LoadAltDescTextQuestConds && Array.isArray(codex.AltDescTextQuestCondIds)) {
      codex.AltDescTextQuestConds = [];
      for (let condId of codex.AltDescTextQuestCondIds) {
        const questExcel = await this.ctrl.selectQuestExcelConfigData(condId);
        if (questExcel && questExcel.MainId) {
          const mainQuestName = await this.ctrl.selectMainQuestName(questExcel.MainId);
          codex.AltDescTextQuestConds.push({
            NameText: mainQuestName,
            MainQuestId: questExcel.MainId
          });
        } else {
          codex.AltDescTextQuestConds.push({NameText: undefined, MainQuestId: undefined});
        }
      }
    }

    return codex;
  }

  private async selectAnimalDescribe(id: number): Promise<AnimalDescribeExcelConfigData> {
    // const animalDescribeRaw = await this.ctrl.cached('AnimalDescribeExcelConfigData', 'json', async () => {
    //   const fileData = await this.ctrl.readExcelDataFile('./AnimalDescribeExcelConfigData.json');
    // });
    return await this.knex.select('*').from('AnimalDescribeExcelConfigData')
      .where({Id: id})
      .first().then(this.ctrl.commonLoadFirst);
  }

  async selectAnimalCodex(id: number, loadConf: LivingBeingLoadConf = {}): Promise<AnimalCodexExcelConfigData> {
    if (this.state.animalCodexCache[id]) {
      return this.state.animalCodexCache[id];
    }
    return await this.knex.select('*').from('AnimalCodexExcelConfigData')
      .where({Id: id})
      .first().then(this.ctrl.commonLoadFirst)
      .then(x => this.postProcessAnimalCodex(x, loadConf));
  }

  async selectAnimalCodexByDescribeId(describeId: number, loadConf: LivingBeingLoadConf = {}): Promise<AnimalCodexExcelConfigData> {
    if (this.state.animalCodexDCache[describeId]) {
      return this.state.animalCodexDCache[describeId];
    }
    return await this.knex.select('*').from('AnimalCodexExcelConfigData')
      .where({DescribeId: describeId})
      .first().then(this.ctrl.commonLoadFirst)
      .then(x => this.postProcessAnimalCodex(x, loadConf));
  }

  async selectAllAnimalCodex(loadConf: LivingBeingLoadConf = {}): Promise<AnimalCodexExcelConfigData[]> {
    return await this.knex.select('*').from('AnimalCodexExcelConfigData')
      .then(this.ctrl.commonLoad)
      .then(ret => ret.asyncMap(x => this.postProcessAnimalCodex(x, loadConf)));
  }

  private async selectAnimalCodexManualTextMap(): Promise<{[manualTextMapId: string]: string}> {
    return this.ctrl.cached('AnimalCodexManualTextMap:' + this.outputLangCode, 'json', async () => {
      return await this.ctrl.manualtm.selectMultiRecordWithTextContentResult([
        'UI_CODEX_ANIMAL_MONSTER',
        'UI_CODEX_ANIMAL_ANIMAL',
        'UI_CODEX_ANIMAL_MONSTER_NONE',
        'UI_CODEX_ANIMAL_ANIMAL_NONE',
        'UI_CODEX_ANIMAL_CATEGORY_ABYSS',
        'UI_CODEX_ANIMAL_CATEGORY_ANIMAL',
        'UI_CODEX_ANIMAL_CATEGORY_AUTOMATRON',
        'UI_CODEX_ANIMAL_CATEGORY_AVIARY',
        'UI_CODEX_ANIMAL_CATEGORY_BEAST',
        'UI_CODEX_ANIMAL_CATEGORY_BOSS',
        'UI_CODEX_ANIMAL_CATEGORY_CRITTER',
        'UI_CODEX_ANIMAL_CATEGORY_FATUI',
        'UI_CODEX_ANIMAL_CATEGORY_FISH',
        'UI_CODEX_ANIMAL_CATEGORY_HILICHURL',
        'UI_CODEX_ANIMAL_CATEGORY_HUMAN',
        'UI_CODEX_ANIMAL_CATEGORY_ELEMENTAL',
        'UI_CODEX_ANIMAL_NAME_LOCKED',
      ]);
    });
  }

  async selectLivingBeingArchive(): Promise<LivingBeingArchive> {
    const [monsterList, codexList, codexManualTextMap] = await Promise.all([
      this.selectAllMonster(),
      this.selectAllAnimalCodex(),
      this.selectAnimalCodexManualTextMap()
    ]);

    const archive: LivingBeingArchive = {
      MonsterCodex: defaultMap((key: string|number): LivingBeingArchiveGroup => ({
        SubType: String(key),
        NameText: codexManualTextMap[String(key).replace('CODEX_SUBTYPE', 'UI_CODEX_ANIMAL_CATEGORY')],
        CodexList: [],
      })),
      WildlifeCodex: defaultMap((key: string|number): LivingBeingArchiveGroup => ({
        SubType: String(key),
        NameText: codexManualTextMap[String(key).replace('CODEX_SUBTYPE', 'UI_CODEX_ANIMAL_CATEGORY')],
        CodexList: [],
      })),
      NonCodexMonsters: {
        HOMEWORLD: {
          SubType: 'CUSTOM_HOMEWORLD',
          NameText: 'HomeWorld',
          CodexList: [],
          MonsterList: []
        },
        NAMED: {
          SubType: 'CUSTOM_NAMED',
          NameText: 'Named',
          CodexList: [],
          MonsterList: []
        },
        UNNAMED: {
          SubType: 'CUSTOM_UNNAMED',
          NameText: 'Unnamed',
          CodexList: [],
          MonsterList: []
        },
      },
    };

    const monsterIdsInCodex: Set<number> = new Set();

    for (let codex of codexList) {
      if (codex.Type === 'CODEX_MONSTER') {
        archive.MonsterCodex[codex.SubType].CodexList.push(codex);
      } else {
        archive.WildlifeCodex[codex.SubType].CodexList.push(codex);
      }
      codex.Monsters.forEach(m => monsterIdsInCodex.add(m.Id));
    }

    for (let monster of monsterList) {
      if (!monsterIdsInCodex.has(monster.Id)) {
        if (monster.MonsterName.toLowerCase().includes('homeworld')) {
          archive.NonCodexMonsters.HOMEWORLD.MonsterList.push(monster);
        } else if (monster.NameText || monster.Describe?.NameText) {
          archive.NonCodexMonsters.NAMED.MonsterList.push(monster);
        } else {
          archive.NonCodexMonsters.UNNAMED.MonsterList.push(monster);
        }
      }
    }

    return archive;
  }
  // endregion
}
