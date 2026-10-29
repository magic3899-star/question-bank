import type { Shuffler } from '../../contracts/index';
import { standardShuffler } from './standard/index';

export const shufflers: Shuffler[] = [standardShuffler];
