# Workflow

Use this workflow to turn source fiction into a producible 沙雕动画小助手 script.

## Input Triage

Classify the source:

- Raw novel text: extract plot and rewrite.
- Chapter summary: expand into scenes and dialogue.
- Multi-chapter arc: split into episodes before scripting.
- Character settings: generate premise-driven scenes.
- User outline: preserve intent, add conflict and hooks.

Ask a question only when the missing detail blocks production, such as absent source text plus no outline. Otherwise make reasonable assumptions and state them briefly.

## Story Extraction

Extract these notes before scripting:

- Protagonist: identity, goal, weakness, current status.
- Antagonist or pressure: person, system, monster, deadline, public humiliation, debt, secret.
- Core conflict: what must change this episode.
- Cool point: victory, reveal, power-up, comeback, face slap, rescue, or absurd discovery.
- Comedy angle: contrast, misunderstanding, overreaction, deadpan narration, status reversal.
- Ending hook: new enemy, exposed secret, impossible choice, or next escalation.

## Episode Structure

Default to 1-3 minutes:

1. Opening hook: 3-5 seconds. Use conflict first, explanation later.
2. Setup: show who is in trouble and what is at stake.
3. Escalation: add humiliation, misunderstanding, absurd obstacle, or pressure.
4. Turn: protagonist discovers leverage, reveals ability, or makes a ridiculous choice.
5. Payoff: face slap, joke, victory, reveal, or disaster.
6. Cliffhanger: leave one question unanswered.

## Long Text Splitting

For long chapters, split by dramatic turns instead of word count:

- One episode equals one clear conflict and one payoff.
- Do not squeeze multiple major victories into one episode unless the user asks for a compact recap.
- If a chapter has many events, output a batch plan first, then script the first episode or the requested range.

## Production Rewrite Rules

- Replace inner monologue with narration or dialogue.
- Keep scene changes simple enough for 沙雕动画小助手.
- Keep dialogue short and playable.
- Use narration to compress exposition.
- Turn static description, action, object usage, scene changes, and emotional turns into narration/dialogue.
- Preserve original plot direction by default.

## Audio-First Animation

沙雕动画小助手的动画推进主要依赖旁白和对白，且许多观众靠听来理解剧情。Do not rely on visual notes to carry meaning.

Use this test before finalizing: delete every visual/action/shot note and production note. If the remaining narration and dialogue cannot explain the plot, the script is not ready.

Required pattern:

```text
制作行表：每一行只放一句旁白或一句对白，可配音效/BGM。
旁白/对白：讲清楚动作、环境、记忆、情绪变化、因果关系。
音效/BGM：只辅助气氛，不承担剧情信息。
```

Weak:

```text
顾砚舟：这不是医院……也不是实验室。
```

Better:

```text
| 序号 | 旁白/对白 | 音效/BGM |
| --- | --- | --- |
| 1 | 旁白：顾砚舟猛地睁开眼，发现自己正躺在一张陌生旧床上。 | 惊醒音 |
| 2 | 旁白：头顶不是医院白灯，而是一顶暗红色旧床帐。 |  |
| 3 | 顾砚舟：这不是医院……也不是实验室。 |  |
| 4 | 旁白：一堆陌生记忆开始往他脑子里挤：八岁，定远侯府，庶子，刚从池塘里捡回一条命。 | 记忆音 |
```

## Line-Level Audio Rows

After drafting each beat, split narration and dialogue into production rows.

Each production row should answer:

- What exact narration or dialogue line is spoken?
- Does this row still make sense if the viewer only listens?
- Does the row say any important action, object, scene change, emotion shift, or causality out loud?
- Does the row connect clearly to the previous and next spoken line?

Prefer one sentence of narration/dialogue per row. Use sound cues only for atmosphere or emphasis.

Good spoken action bridges:

- 旁白：刘嬷嬷扶他坐好，又端来一碗黑药。
- 旁白：顾砚舟接过药碗，先问起落水那天的事。
- 旁白：翠儿和红玉刚走，刘嬷嬷就忍不住骂出了声。
- 旁白：顾砚林故意撞了顾砚舟肩膀一下。

Avoid silent-action dependence:

- 只在画面/制作备注里写“顾砚林撞肩”，但口播没有提到。
- 只在画面/制作备注里写“刘嬷嬷端来药碗”，然后对白突然说“药太苦”。

## Continuity

Read only the `旁白/对白` column from top to bottom before finalizing.

- Characters, props, and locations must appear in a logical order in the spoken text.
- Introduce a prop before using it. For example, before `顾砚舟放下药碗`, say `刘嬷嬷端来药碗` or `顾砚舟接过药碗`.
- Introduce a character before they speak or act. For example, before a maid speaks, say `门外来了个丫鬟`.
- Use walking, door opening/closing, servant arrival, bells, meals, dressing, reading, or explicit narration to bridge scene changes.
- Check actions, objects, language, character names/ages/status, motivation, and plot causality for continuity and completeness.

Continuity weak:

```text
| 1 | 刘嬷嬷：少爷！您可算醒了！ | 哭腔 |
| 2 | 顾砚舟：我怎么掉池子里的？ |  |
```

Continuity better:

```text
| 1 | 刘嬷嬷：少爷！您可算醒了！ | 哭腔 |
| 2 | 旁白：刘嬷嬷扶他坐好，又端来一碗黑药。 |  |
| 3 | 顾砚舟接过药碗，却没有急着喝。 |  |
| 4 | 顾砚舟：我怎么掉池子里的？ |  |
```

## Narration-Dialogue Continuity

沙雕动画小助手主要靠旁白和对白推进动画。Write every beat as a connected chain, not as separate notes.

Each beat should answer four questions:

- What line or action from the previous beat caused this beat?
- What does the narration explain or escalate?
- What does the dialogue reveal, challenge, or decide?
- What line, action, or question pushes the next beat forward?

Use bridge lines before exposition. Do not jump directly from a character line to unrelated family background, worldbuilding, or narrator summary.

Weak:

```text
顾砚舟：让你吃就吃。
旁白：大哥嫡出，二哥嫡出，三哥赵姨娘生……
```

Better:

```text
顾砚舟：让你吃就吃。
旁白：石头接过馒头，低头小口啃着。刘嬷嬷转身去衣柜里翻出一件洗得发白的长衫。
旁白：趁着换衣的功夫，顾砚舟终于把原主记忆里的侯府关系理清了。
旁白：嫡出的少爷小姐最尊贵，赵姨娘和李姨娘各有儿女依仗，至于他这个柳姨娘留下的八郎，院子偏，人也轻。
```

Good bridge patterns:

- Action bridge: a character starts dressing, walking, eating, reading, or looking at an object, and the narration uses that action to enter background.
- Memory bridge: a question triggers the protagonist's inherited memories.
- Reaction bridge: one character's insult triggers narration explaining the power relationship.
- Transition bridge: a servant arrives, a bell rings, a door opens, or the location changes.
- Decision bridge: the protagonist makes a choice, then the next scene shows the consequence.

## Final Pass

Check:

- Can a voice actor read it directly?
- Can a listener understand the complete story with no visuals?
- Do narration and dialogue connect line by line, with no unexplained topic jump?
- Are language, actions, objects, characters, and plot causality continuous and complete?
- Are entrances, exits, props, locations, and time jumps spoken aloud before they matter?
- Does the opening start fast enough?
- Does the ending make the viewer want the next episode?
- Is it a script, not a novel retelling?
