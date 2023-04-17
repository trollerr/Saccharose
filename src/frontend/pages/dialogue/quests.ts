import { endpoints } from '../../endpoints';
import { startListeners } from '../../util/eventLoader';
import { modalService } from '../../util/modalService';
import { flashTippy } from '../../util/tooltips';
import { pageMatch } from '../../pageMatch';
import { GeneralEventBus } from '../../generalEventBus';
import { HttpError } from '../../../shared/util/httpError';
import { isInt } from '../../../shared/util/numberUtil';

pageMatch('pages/dialogue/quests', () => {
  let lastSuccessfulQuestId: number = 0;

  function postLoad(resultParent: HTMLElement) {
    for (let section of Array.from(resultParent.querySelectorAll('.dialogue-section'))) {
      if (section.hasAttribute('data-similarity-group')) {
        const groupId = section.getAttribute('data-similarity-group');

        let parent = section.parentElement.closest('.dialogue-section');
        while (!!parent) {
          if (!parent.hasAttribute('data-parent-of-similarity-group-' + groupId)) {
            parent.setAttribute('data-parent-of-similarity-group-' + groupId, '');
          }
          parent = parent.parentElement.closest('.dialogue-section');
        }
      }
    }

    startListeners([
      {
        el: '[data-filter-similarity-group]',
        ev: 'click',
        multiple: true,
        fn: function(event, target) {
          if (target.classList.contains('active')) {
            return;
          }

          document.querySelectorAll('[data-filter-similarity-group]').forEach(el => el.classList.remove('active'));

          const sections = Array.from(resultParent.querySelectorAll('.dialogue-section'));

          let groupId = target.getAttribute('data-filter-similarity-group');
          if (groupId === 'RESET') {
            sections.forEach(sect => sect.classList.remove('hide', 'parent-hide'));
            flashTippy(target, {content: 'All sections restored.'});
          } else if (isInt(groupId)) {
            target.classList.add('active');
            flashTippy(target, {content: 'Dialogue sections filtered to just this group.'});
            for (let sect of sections) {

              if (sect.getAttribute('data-similarity-group') === groupId) {
                sect.classList.remove('hide');
                sect.classList.remove('parent-hide');
              } else if (sect.hasAttribute('data-parent-of-similarity-group-' + groupId)) {
                sect.classList.remove('hide');
                sect.classList.add('parent-hide');
              } else {
                sect.classList.add('hide');
                sect.classList.remove('parent-hide');
              }
            }
          }
        }
      }
    ], resultParent);
  }

  function loadQuestGenerateResult(questId) {
    if (!isInt(questId)) {
      return;
    }

    document.querySelector('.quest-search-result-wrapper').classList.add('hide');

    document.querySelector('#quest-generate-result').innerHTML = `
  <div class="valign spacer10-left">
    <span class="loading"></span>
    <span class="spacer10-left fontWeight600">Loading quest...</span>
  </div>`

    endpoints.generateMainQuest.get({ id: questId }, true).then(html => {
      lastSuccessfulQuestId = questId;
      document.querySelector('#quest-generate-result').innerHTML = html;
      postLoad(document.querySelector('#quest-generate-result'));
      setTimeout(() => {
        let questTitleEl = document.querySelector('[data-document-title]');
        if (questTitleEl) {
          document.title = questTitleEl.getAttribute('data-document-title');
        }
      })
      startListeners(questResultListeners, '#quest-generate-result');
    }).catch((err: HttpError) => {
      document.querySelector('#quest-generate-result').innerHTML = endpoints.errorHtmlWrap(err.message);
    });
  }

  function loadQuestGenerateResultFromUrl() {
    let urlParts = /\/quests\/(\d+)/i.exec(window.location.href);
    if (!urlParts || urlParts.length < 2) {
      window.history.replaceState({}, null, window.location.href);
      return;
    }
    let id: string = urlParts[1];
    window.history.replaceState({questId: id}, null, window.location.href);
    loadQuestGenerateResult(id);
  }

  function loadQuestGenerateResultFromState(state) {
    if (!state)
      state = {};
    if (state.questId) {
      loadQuestGenerateResult(state.questId);
    } else {
      document.querySelector('.quest-search-result-wrapper').classList.add('hide');
      document.querySelector('#quest-generate-result').innerHTML = '';
    }
    if (state.q) {
      document.querySelector<HTMLInputElement>('.quest-search-input').value = state.q;
    } else {
      document.querySelector<HTMLInputElement>('.quest-search-input').value = '';
    }
  }

  GeneralEventBus.on('outputLangCodeChanged', () => {
    if (lastSuccessfulQuestId) {
      loadQuestGenerateResult(lastSuccessfulQuestId);
    }
  });

  const questResultListeners = [
    {
      el: '.help-info',
      ev: 'click',
      multiple: true,
      fn: function(_event, _target) {
        modalService.modal(`<h2>Notes</h2>
          <ul class="padding">
            <li>The order of dialogue sections is not guaranteed to be in the correct chronological order nor are the "Section Order" parameters reliable.
              The "Quest Step" parameters listed under sections don't always match up either. But the dialogue within a textbox is guaranteed to be in the right order.
            </li>
            <li>You may sometimes notice seemingly duplicate dialogue sections. These dialogue sections may have slight differences depending on player's completion of
              other quests/objectives.
            </li>
            <li>You may sometimes notice dialogue sections that start with a dialogue option. These are sometimes for conditional dialogue options.
              You may have to adjust the dialogue depth (number of <code>:</code>'s at the start of a dialogue line) manually sometimes.
            </li>
            <li>The tool cannot distinguish between player dialogue options and Traveler spoken lines. For most quests you don't have to worry about this,
              but some quests like Archon Quests and Flagship Event Quests may have Traveler spoken lines.
            </li>
          </ul>
          <div class="buttons spacer15-top">
            <button class="primary" ui-action="close-modals">Dismiss</button>
          </div>`,
          {
            modalCssStyle: 'max-width:800px;margin-top:90px'
          });
      }
    },
  ];

  const listeners = [
    {
      ev: 'ready',
      fn: function() {
        loadQuestGenerateResultFromUrl();
      }
    },
    {
      el: 'window',
      ev: 'popstate', // user clicks browser back/forward buttons
      fn: function(event) {
        if (!event.state) {
          return;
        }
        loadQuestGenerateResultFromState(event.state);
      }
    },
    {
      el: '.quest-search-input',
      ev: 'enter',
      fn: function(_event, _target) {
        document.querySelector<HTMLButtonElement>('.quest-search-submit').click();
      }
    },
    {
      el: '.quest-search-submit',
      ev: 'click',
      fn: function(event, target) {
        let inputEl = document.querySelector<HTMLInputElement>('.quest-search-input');
        let loadingEl = document.querySelector('.quest-search-submit-pending');
        let text = inputEl.value.trim();

        if (!text) {
          flashTippy(inputEl, {content: 'Enter a quest name first!', delay:[0,2000]});
          return;
        }

        loadingEl.classList.remove('hide');
        inputEl.disabled = true;
        target.disabled = true;

        endpoints.findMainQuest.get({ name: text }, true).then(result => {
          document.querySelector('.quest-search-result-wrapper').classList.remove('hide');
          document.querySelector('.quest-search-result').innerHTML = result;

          startListeners([
            {
              el: '.quest-search-result',
              ev: 'click',
              fn: function(event: MouseEvent) {
                console.log('Search result clicked', event);

                let target: HTMLAnchorElement = (event.target as HTMLElement).closest('a');
                let href = target.href;

                if (event.ctrlKey) {
                  return; // allow default behavior if ctrl-click
                }

                event.stopPropagation();
                event.preventDefault();
                console.log('Changing url to', href);

                let questId = target.getAttribute('data-id');

                window.history.pushState({questId: questId, q: text}, null, href);
                loadQuestGenerateResult(questId);
              }
            },
          ], '.quest-search-result');
        }).finally(() => {
          loadingEl.classList.add('hide');
          inputEl.disabled = false;
          target.disabled = false;
        });
      }
    },
  ];

  startListeners(listeners);
});