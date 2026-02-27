import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError, ZodIssue } from "zod";
import { Logger } from "../singletons/logger";

/**
 * Middleware factory for validating request bodies using Zod schemas
 * 
 * NOTE: This middleware mutates req.body by replacing it with the validated result.
 * This ensures that downstream handlers receive properly typed and validated data.
 * 
 * @param schema - Zod schema to validate the request body against
 * @returns Express middleware function
 */
export function validateBody(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                Logger.error(undefined, `Body validation error: ${JSON.stringify(error.issues)}`);
                return res.status(400).json({
                    status: "error",
                    message: "Validation failed",
                    details: error.issues.map((e: ZodIssue) => `${e.path.join(".")}: ${e.message}`).join(", ")
                });
            }
            Logger.error(undefined, `Unexpected validation error: ${error}`);
            return res.status(500).json({
                status: "error",
                message: "Internal validation error"
            });
        }
    };
}

/**
 * Middleware factory for validating request parameters using Zod schemas
 * 
 * NOTE: This middleware mutates req.params by replacing it with the validated result.
 * Type assertion is required due to Express's ParamsDictionary type constraints.
 * 
 * @param schema - Zod schema to validate the request parameters against
 * @returns Express middleware function
 */
export function validateParams(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            req.params = schema.parse(req.params) as typeof req.params;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                Logger.error(undefined, `Param validation error: ${JSON.stringify(error.issues)}`);
                return res.status(400).json({
                    status: "error",
                    message: "Validation failed",
                    details: error.issues.map((e: ZodIssue) => `${e.path.join(".")}: ${e.message}`).join(", ")
                });
            }
            Logger.error(undefined, `Unexpected validation error: ${error}`);
            return res.status(500).json({
                status: "error",
                message: "Internal validation error"
            });
        }
    };
}

/**
 * Middleware factory for validating both params and body
 * 
 * NOTE: This middleware mutates req.params and/or req.body by replacing them with validated results.
 * This ensures that downstream handlers receive properly typed and validated data.
 * 
 * @param options - Object containing optional params and body schemas
 * @returns Express middleware function
 */
export function validate(options: { params?: ZodSchema; body?: ZodSchema }) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (options.params) {
                req.params = options.params.parse(req.params) as typeof req.params;
            }
            if (options.body) {
                req.body = options.body.parse(req.body);
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                Logger.error(undefined, `Validation error: ${JSON.stringify(error.issues)}`);
                return res.status(400).json({
                    status: "error",
                    message: "Validation failed",
                    details: error.issues.map((e: ZodIssue) => `${e.path.join(".")}: ${e.message}`).join(", ")
                });
            }
            Logger.error(undefined, `Unexpected validation error: ${error}`);
            return res.status(500).json({
                status: "error",
                message: "Internal validation error"
            });
        }
    };
}
