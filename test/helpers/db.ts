/**
 * Chuan bi CSDL cho test: tao bang trong file rieng (data/test.sqlite),
 * khong dung chung voi CSDL that.
 */
import { migrate } from '../../src/db/index.js';

migrate();
