/**
 * Result helper utilities for consistent error handling
 */

import type { Result } from '../interfaces/ai';

export class ResultUtils {
  static success<T>(data: T): Result<T> {
    return {
      success: true,
      data
    };
  }

  static error<T>(error: Error | string): Result<T> {
    return {
      success: false,
      error: typeof error === 'string' ? new Error(error) : error
    };
  }

  static async fromPromise<T>(promise: Promise<T>): Promise<Result<T>> {
    try {
      const data = await promise;
      return ResultUtils.success(data);
    } catch (error) {
      return ResultUtils.error(error as Error);
    }
  }

  static isSuccess<T>(result: Result<T>): result is Result<T> & { data: T } {
    return result.success && result.data !== undefined;
  }

  static isError<T>(result: Result<T>): result is Result<T> & { error: Error } {
    return !result.success && result.error !== undefined;
  }

  static unwrap<T>(result: Result<T>, defaultValue?: T): T {
    if (ResultUtils.isSuccess(result)) {
      return result.data;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw result.error || new Error('Result contained no data or error');
  }

  static unwrapOr<T>(result: Result<T>, defaultValue: T): T {
    return ResultUtils.isSuccess(result) ? result.data : defaultValue;
  }

  static map<T, U>(result: Result<T>, fn: (data: T) => U): Result<U> {
    if (ResultUtils.isSuccess(result)) {
      try {
        return ResultUtils.success(fn(result.data));
      } catch (error) {
        return ResultUtils.error(error as Error);
      }
    }
    return {
      success: false,
      error: result.error
    };
  }

  static flatMap<T, U>(result: Result<T>, fn: (data: T) => Result<U>): Result<U> {
    if (ResultUtils.isSuccess(result)) {
      return fn(result.data);
    }
    return {
      success: false,
      error: result.error
    };
  }
}