import type { Validator } from '../../../contracts/index';
import { isEmptyBlocks } from '../../content-model/index';

export const emptyContentValidator: Validator = {
  kind: 'validator',
  id: 'empty-content',
  label: '문제 본문 누락',
  validate: (question) =>
    isEmptyBlocks(question.stem)
      ? [
          {
            severity: 'error',
            code: 'STEM_EMPTY',
            message: '문제 본문이 비었습니다. 본문에 글자, 이미지 또는 표 내용을 입력하세요.',
            ref: {
              ...('id' in question && typeof question.id === 'string' ? { questionId: question.id } : {}),
            },
          },
        ]
      : [],
};
