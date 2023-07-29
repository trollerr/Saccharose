import morgan from 'morgan';
import { Request, Response } from '../../util/router';

import { DEFAULT_LANG } from '../../../shared/types/lang-types';
import { DEFAULT_SEARCH_MODE } from '../../util/searchUtil';

const logSkipRegex: RegExp = /\.css|\.js|\.png|\.svg|\.ico|\.jpg|\.woff|\.env/g;

morgan.token('date', function(){
  return new Date().toLocaleString('en-US', {timeZone: 'America/Los_Angeles'});
});

morgan.token('url', (req: Request) => decodeURI(req.originalUrl || req.url));
morgan.token('inputLanguage', (req: Request) => req.cookies['inputLangCode'] || DEFAULT_LANG);
morgan.token('outputLanguage', (req: Request) => req.cookies['outputLangCode'] || DEFAULT_LANG);
morgan.token('searchMode', (req: Request) => req.cookies['search-mode'] || DEFAULT_SEARCH_MODE);

export default morgan('[:date[web] PST] [:inputLanguage::outputLanguage|:searchMode] :status :method :url (:response-time ms)', {
  skip: function(req: Request, res: Response) {
    return res.statusCode === 304 || logSkipRegex.test(req.url);
  }
});