import { IS_MOCK } from '../config';
import { gasApi } from './gasApi';
import { mockApi } from './mockApi';

/** 앱 전체가 사용하는 단일 API 객체 (GAS ↔ 데모 모드 자동 전환) */
export const api = IS_MOCK ? mockApi : gasApi;
