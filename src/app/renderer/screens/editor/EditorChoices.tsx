import type { Question } from '../../../../contracts/index';
import { blocksToPlainText, referencesChoiceLabels } from '../../../../modules/content-model/index';
import { Button, RichTextField, Badge } from '../../components/index';

export function EditorChoices({
  question: q,
  change,
}: {
  question: Question;
  change: (patch: Partial<Question>) => void;
}) {
  const reference = referencesChoiceLabels([...q.stem, ...(q.passage ?? []), ...q.explanation]);
  return (
    <section id="editor-choices" tabIndex={-1}>
      <h3>선지와 정답</h3>
      {!q.answerChoiceIds.length && <p role="status">정답을 선택하세요.</p>}
      {reference && <Badge>해설·본문이 선지 번호를 참조해 선지 순서를 고정합니다</Badge>}
      <label>
        <input
          type="checkbox"
          checked={q.shufflePolicy === 'lock-all'}
          onChange={(e) =>
            change({
              shufflePolicy: e.target.checked ? 'lock-all' : 'free',
              extra: { ...q.extra, allowChoiceShuffle: !e.target.checked },
            })
          }
        />
        전체 선지 순서 고정
      </label>
      {reference && q.shufflePolicy === 'free' && (
        <p role="alert">선지를 섞으면 본문·해설의 번호가 달라집니다. 선지 순서 고정을 권장합니다.</p>
      )}
      {q.choices.map((choice, index) => (
        <fieldset key={choice.id}>
          <legend>{'①②③④⑤⑥⑦⑧⑨⑩'[index]} 선지</legend>
          <RichTextField
            label={`${index + 1}번 선지 내용`}
            value={choice.content}
            onChange={(content) =>
              change({ choices: q.choices.map((c) => (c.id === choice.id ? { ...c, content } : c)) })
            }
          />
          <label>
            <input
              type="checkbox"
              checked={q.answerChoiceIds.includes(choice.id)}
              onChange={(e) =>
                change({
                  answerChoiceIds: e.target.checked
                    ? [...q.answerChoiceIds, choice.id]
                    : q.answerChoiceIds.filter((id) => id !== choice.id),
                })
              }
            />
            정답
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!choice.fixedPosition}
              onChange={(e) =>
                change({
                  choices: q.choices.map((c) =>
                    c.id === choice.id ? { ...c, fixedPosition: e.target.checked } : c,
                  ),
                })
              }
            />
            위치 고정
          </label>
          {!choice.fixedPosition &&
            /[①-⑩]|모두|위의|상기|해당 없음|정답 없음/u.test(blocksToPlainText(choice.content)) && (
              <Button
                onClick={() =>
                  change({
                    choices: q.choices.map((c) => (c.id === choice.id ? { ...c, fixedPosition: true } : c)),
                  })
                }
              >
                다른 선지를 참조합니다 — 위치 고정 적용
              </Button>
            )}
          {[-1, 1].map((direction) => (
            <Button
              key={direction}
              aria-label={`${index + 1}번 선지 ${direction < 0 ? '위로' : '아래로'}`}
              disabled={index + direction < 0 || index + direction >= q.choices.length}
              onClick={() => {
                const choices = [...q.choices];
                [choices[index], choices[index + direction]] = [choices[index + direction]!, choices[index]!];
                change({ choices });
              }}
            >
              {direction < 0 ? '↑ 위로' : '↓ 아래로'}
            </Button>
          ))}
          <Button
            disabled={q.choices.length <= 2}
            onClick={() =>
              change({
                choices: q.choices.filter((c) => c.id !== choice.id),
                answerChoiceIds: q.answerChoiceIds.filter((id) => id !== choice.id),
              })
            }
          >
            선지 삭제
          </Button>
        </fieldset>
      ))}
      <Button
        disabled={q.choices.length >= 10}
        onClick={() => change({ choices: [...q.choices, { id: crypto.randomUUID(), content: [] }] })}
      >
        선지 추가
      </Button>
    </section>
  );
}
