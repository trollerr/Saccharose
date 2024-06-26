import { create } from '../../../routing/router.ts';
import { Router } from 'express';
import StarRailBasicRouter from './StarRailBasicRouter.ts';
import StarRailCharacterRouter from './StarRailCharacterRouter.ts';
import StarRailMediaRouter from './StarRailMediaRouter.ts';

export default async function(): Promise<Router> {
  const router: Router = create();

  router.use('/', await StarRailBasicRouter());
  router.use('/', await StarRailCharacterRouter());
  router.use('/', await StarRailMediaRouter());

  return router;
}
