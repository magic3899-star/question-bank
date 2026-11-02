import { useState } from 'react';
import { ArrowDown, ArrowUp, ListTree, Plus, Trash2 } from 'lucide-react';
import type { RuleSet, SlotSpec } from '../../../../contracts/index';
import { Badge, Button, Input, Select } from '../../components/index';
import { ObjectivePicker } from './ObjectivePicker';
import { fromConstraintForm, parsePrefixes, toConstraintForm } from './ruleForm';
import type { ConstraintForm, SegmentMode } from './ruleForm';
import styles from './RuleEditor.module.css';

export function RuleEditor({
  draft,
  setDraft,
  subjects,
  saved,
}: {
  draft: RuleSet;
  setDraft: (rules: RuleSet) => void;
  subjects: { id: string; name: string }[];
  saved: RuleSet;
}) {
  const [picker, setPicker] = useState<number>();
  const [confirmed, setConfirmed] = useState(false);
  const form = toConstraintForm(draft);
  const setForm = (patch: Partial<ConstraintForm>, keep = !confirmed) =>
    setDraft({ ...draft, constraints: fromConstraintForm({ ...form, ...patch }, keep, saved) });
  const setSlot = (index: number, patch: Partial<SlotSpec>) =>
    setDraft({ ...draft, slots: draft.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) });
  const move = (index: number, delta: number) => {
    const slots = [...draft.slots];
    const [slot] = slots.splice(index, 1);
    slots.splice(index + delta, 0, slot!);
    setDraft({ ...draft, slots });
  };
  const prefixesOf = (slot: SlotSpec) => (slot.filter.kind === 'objectivePrefix' ? slot.filter.prefixes : []);
  return (
    <div className={styles.form}>
      <div className={styles.grid2}>
        <Input
          label="규칙 이름"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Select
          label="과목"
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
        >
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </Select>
        <Input
          label="만들 회차 수"
          type="number"
          min={1}
          max={50}
          value={draft.examCount}
          onChange={(e) => setDraft({ ...draft, examCount: Math.max(1, Math.floor(Number(e.target.value))) })}
        />
        <Input
          label="첫 문제 번호"
          type="number"
          min={1}
          value={draft.startNumber}
          onChange={(e) =>
            setDraft({ ...draft, startNumber: Math.max(1, Math.floor(Number(e.target.value))) })
          }
        />
      </div>
      <h3>슬롯(어디서 몇 문제 뽑을지)</h3>
      <ol className={styles.slots}>
        {draft.slots.map((slot, index) => (
          <li key={slot.id} className={styles.slot}>
            <div className={styles.slotRow}>
              <Input
                label="슬롯 이름"
                value={slot.label}
                onChange={(e) => setSlot(index, { label: e.target.value })}
              />
              <Input
                label="회차당 문제 수"
                type="number"
                min={1}
                value={slot.count}
                onChange={(e) => setSlot(index, { count: Math.max(1, Math.floor(Number(e.target.value))) })}
              />
              <div className={styles.slotButtons}>
                <button
                  type="button"
                  aria-label="위로"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="아래로"
                  disabled={index === draft.slots.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="슬롯 삭제"
                  onClick={() => setDraft({ ...draft, slots: draft.slots.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className={styles.prefixRow}>
              <Input
                label="대상 학습목표 (쉼표로 구분, 예: 법규 1, 법규 2-1)"
                value={prefixesOf(slot).join(', ')}
                onChange={(e) =>
                  setSlot(index, {
                    filter: { kind: 'objectivePrefix', prefixes: parsePrefixes(e.target.value) },
                  })
                }
              />
              <Button onClick={() => setPicker(index)}>
                <ListTree aria-hidden="true" />
                목록에서 고르기
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Button
        onClick={() =>
          setDraft({
            ...draft,
            slots: [
              ...draft.slots,
              {
                id: `slot-${Date.now().toString(36)}`,
                label: `슬롯 ${draft.slots.length + 1}`,
                count: 1,
                filter: { kind: 'objectivePrefix', prefixes: [] },
              },
            ],
          })
        }
      >
        <Plus aria-hidden="true" />
        슬롯 추가
      </Button>
      <h3>출제 조건</h3>
      {form.unconfirmed.length > 0 && !confirmed && (
        <div className={styles.unconfirmed}>
          <Badge kind="confirmation">확인 필요</Badge>
          <div>
            {form.unconfirmed.map((item) => (
              <p key={item.kind}>{item.note ?? '의미를 확인해야 하는 조건이 있습니다.'}</p>
            ))}
            <Button
              onClick={() => {
                setConfirmed(true);
                setForm({}, false);
              }}
            >
              내용을 확인했습니다
            </Button>
          </div>
        </div>
      )}
      <div className={styles.conditions}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.noOverlap}
            onChange={() => setForm({ noOverlap: !form.noOverlap })}
          />
          <span>
            <strong>회차끼리 같은 문제 금지</strong>
            <small>여러 회차를 만들 때 한 문제는 한 회차에만 나옵니다.</small>
          </span>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.noDuplicate}
            onChange={() => setForm({ noDuplicate: !form.noDuplicate })}
          />
          <span>
            <strong>같은 지문 중복 금지</strong>
            <small>선지가 달라도 지문이 같은 문제는 함께 나오지 않습니다.</small>
          </span>
        </label>
        {form.noDuplicate && (
          <Select
            label="같은 지문 금지 범위"
            value={form.duplicateScope}
            onChange={(e) => setForm({ duplicateScope: e.target.value as 'run' | 'exam' })}
          >
            <option value="run">모든 회차 전체</option>
            <option value="exam">같은 회차 안에서만</option>
          </Select>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.distinctMiddle}
            onChange={() => setForm({ distinctMiddle: !form.distinctMiddle })}
          />
          <span>
            <strong>한 슬롯 안에서 중단원이 서로 다르게</strong>
            <small>예: 법규 1단원의 5문제는 1-1, 1-2, 1-3…처럼 서로 다른 중단원에서 뽑습니다.</small>
          </span>
        </label>
        {form.distinctMiddle && (
          <Select
            label="중단원 조건 적용 방식"
            value={form.middleMode}
            onChange={(e) => setForm({ middleMode: e.target.value as SegmentMode })}
          >
            <option value="strict-unless-single">
              반드시 (중단원이 하나뿐인 단원은 면제, 모자라면 빈 번호)
            </option>
            <option value="strict">반드시 (모자라면 빈 번호)</option>
            <option value="prefer">가능하면 (모자라면 겹쳐도 채움)</option>
          </Select>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.distinctObjective}
            onChange={() => setForm({ distinctObjective: !form.distinctObjective })}
          />
          <span>
            <strong>같은 회차에서 같은 학습목표 중복 금지</strong>
            <small>예: 법규 1-1-3 문제가 한 회차에 두 번 나오지 않습니다.</small>
          </span>
        </label>
        <Input
          label="최근 N회 출제한 문제 제외 (0 = 제외 안 함)"
          type="number"
          min={0}
          max={100}
          value={form.excludeRecent}
          onChange={(e) => setForm({ excludeRecent: Math.max(0, Math.floor(Number(e.target.value))) })}
        />
      </div>
      {picker !== undefined && draft.slots[picker] && (
        <ObjectivePicker
          subject={draft.subject}
          selected={prefixesOf(draft.slots[picker]!)}
          close={() => setPicker(undefined)}
          apply={(prefixes) => {
            setSlot(picker, { filter: { kind: 'objectivePrefix', prefixes } });
            setPicker(undefined);
          }}
        />
      )}
    </div>
  );
}
