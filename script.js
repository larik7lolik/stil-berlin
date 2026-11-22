/* ============================================================
   СТИЛЬ — интерактив лендинга
   ============================================================ */

/* ------------------------------------------------------------
   ЗАМЕНИТЕ ПРИ ВНЕДРЕНИИ:
   whatsapp — ссылка вида https://wa.me/49XXXXXXXXXX
   telegram — ссылка вида https://t.me/username (необязательно)
   city     — город, который подставится вместо [Город]
   formEndpoint — URL приёма заявок (Formspree, Google Apps Script, Make и т.д.)
   Если ссылка пустая, кнопки просто ведут к блоку контакта.
   Если formEndpoint пустой, форма работает в демо-режиме.
------------------------------------------------------------ */
const SITE_CONFIG = {
  whatsapp: '',
  telegram: '',
  city: 'Берлин',
  formEndpoint: 'https://script.google.com/macros/s/AKfycbzq9JOofs-C_b_5ZafdaL4FtCQVoSgV10fFLwyedj5fAouDhxozN8q22tynP8hQdVKn/exec'
};

/* ---------- Двуязычие ---------- */
const I18N = window.STIL_I18N || { ru: {}, de: {}, attrs: { ru: {}, de: {} } };
let currentLang = 'ru';

const t = (key, vars = {}) => {
  let value = (I18N[currentLang] && I18N[currentLang][key]) || I18N.ru[key] || key;
  Object.keys(vars).forEach(name => {
    value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(vars[name]));
  });
  return value;
};

const localizedCity = () => (currentLang === 'de' ? 'Berlin' : SITE_CONFIG.city);

document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  try {
    const savedLang = localStorage.getItem('stil-lang');
    if (savedLang === 'ru' || savedLang === 'de') currentLang = savedLang;
  } catch (ignored) {
    // Приватный режим может запретить localStorage — используем русский по умолчанию.
  }

  // Запоминаем исходные тексты до любых динамических изменений.
  const textNodes = [];
  const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement && node.parentElement.tagName;
      if (!node.nodeValue.trim() || tag === 'SCRIPT' || tag === 'STYLE') {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (textWalker.nextNode()) {
    const node = textWalker.currentNode;
    node.__stilyOriginal = node.nodeValue;
    textNodes.push(node);
  }

  const attrNodes = [];
  document.querySelectorAll('[placeholder], [aria-label], [title]').forEach(el => {
    if (el.hasAttribute('data-calc-cta') || el.id === 'navToggle') return;
    ['placeholder', 'aria-label', 'title'].forEach(attr => {
      const original = el.getAttribute(attr);
      if (original) attrNodes.push({ el, attr, original });
    });
  });

  /* ---------- Подстановка города и ссылок ---------- */
  document.querySelectorAll('[data-city]').forEach(el => {
    el.textContent = localizedCity();
  });

  const meta = document.querySelector('meta[name="description"]');
  if (meta) {
    meta.setAttribute('content', meta.getAttribute('content').replace('[Город]', SITE_CONFIG.city));
  }

  const contactUrl = SITE_CONFIG.whatsapp || SITE_CONFIG.telegram;
  if (contactUrl) {
    document.querySelectorAll('[data-contact]').forEach(link => {
      link.setAttribute('href', contactUrl);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
  }

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Калькулятор в карточках цен ---------- */
  const buildContactUrl = text => {
    const base = SITE_CONFIG.whatsapp || SITE_CONFIG.telegram || 'https://wa.me/';
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}text=${encodeURIComponent(text)}`;
  };

  const calcUpdaters = [];

  document.querySelectorAll('.calc').forEach(calc => {
    const select = calc.querySelector('[data-calc-select]');
    const priceEl = calc.querySelector('[data-calc-price]');
    const cta = calc.querySelector('[data-calc-cta]');
    if (!select || !priceEl || !cta) return;

    const update = () => {
      const option = select.options[select.selectedIndex];
      const service = t(option.dataset.label || option.textContent.trim());
      const price = t(option.dataset.price || '');

      priceEl.textContent = price;
      cta.setAttribute('aria-label', t('calcAria', { service }));
      cta.href = buildContactUrl(t('whatsappText', {
        service,
        city: localizedCity(),
        price
      }));
      cta.setAttribute('target', '_blank');
      cta.setAttribute('rel', 'noopener noreferrer');
    };

    calcUpdaters.push(update);
    select.addEventListener('change', update);
    update();
  });

  /* ---------- Модальное окно заявки ---------- */
  const modal = document.getElementById('requestModal');
  const form = document.getElementById('requestForm');
  const formStatus = document.getElementById('formStatus');
  const formSubmit = document.getElementById('formSubmit');
  const formSuccess = document.getElementById('formSuccess');
  const modalFormView = document.getElementById('modalFormView');
  const successText = document.getElementById('successText');
  const formService = document.getElementById('formService');
  const formCity = document.getElementById('formCity');
  let lastFocused = null;
  let lastSuccessService = '';

  const setFormStatus = (key, ok = false) => {
    formStatus.textContent = t(key);
    formStatus.dataset.msgKey = key;
    formStatus.classList.toggle('ok', ok);
  };

  const clearFormStatus = () => {
    formStatus.textContent = '';
    delete formStatus.dataset.msgKey;
    formStatus.classList.remove('ok');
  };

  // Список услуг собирается из карточек прайса — данные не дублируются.
  // value остаётся каноничным русским, на экране показывается перевод.
  const renderServiceOptions = () => {
    const selected = formService.value;

    formService.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = t('Выберите услугу');
    formService.appendChild(placeholder);

    document.querySelectorAll('.price-card').forEach(card => {
      const category = t(card.querySelector('.price-head h3')?.textContent.trim() || 'Услуги');
      const group = document.createElement('optgroup');
      group.label = category;

      card.querySelectorAll('[data-calc-select] option').forEach(option => {
        const canonicalLabel = option.dataset.label || option.textContent.trim();
        const canonicalPrice = option.dataset.price || '';
        const item = document.createElement('option');
        item.value = `${canonicalLabel} — ${canonicalPrice}`.trim();
        item.textContent = `${t(canonicalLabel)} — ${t(canonicalPrice)}`.trim();
        group.appendChild(item);
      });

      if (group.children.length) formService.appendChild(group);
    });

    if ([...formService.options].some(option => option.value === selected)) {
      formService.value = selected;
    }
  };

  renderServiceOptions();

  const displayServiceLabel = canonical => {
    const option = [...formService.options].find(item => item.value === canonical);
    return option ? option.textContent : canonical;
  };

  const openModal = (trigger, service = '') => {
    lastFocused = trigger || document.activeElement;
    form.reset();
    formService.value = service;
    formCity.value = SITE_CONFIG.city;
    clearFormStatus();
    modalFormView.hidden = false;
    formSuccess.hidden = true;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    window.requestAnimationFrame(() => form.elements.firstName.focus());
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused) lastFocused.focus();
  };

  document.querySelectorAll('[data-contact], [data-calc-cta]').forEach(trigger => {
    trigger.addEventListener('click', event => {
      event.preventDefault();
      let service = '';

      if (trigger.hasAttribute('data-calc-cta')) {
        const select = trigger.closest('.calc')?.querySelector('[data-calc-select]');
        if (select) {
          const option = select.options[select.selectedIndex];
          service = `${option.dataset.label || option.textContent.trim()} — ${option.dataset.price || ''}`.trim();
        }
      }

      openModal(trigger, service);
    });
  });

  modal.querySelectorAll('[data-modal-close]').forEach(el => {
    el.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', event => {
    if (!modal.classList.contains('open')) return;

    if (event.key === 'Escape') {
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')]
      .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!formService.value) {
      setFormStatus('serviceRequired');
      formService.focus();
      return;
    }
    if (!form.elements.consent.checked) {
      setFormStatus('consentRequired');
      form.elements.consent.focus();
      return;
    }
    if (!form.reportValidity()) return;

    const phone = form.elements.whatsapp.value.trim();
    const digits = phone.replace(/\D/g, '');
    const phoneFormatOk = /^\+?[0-9 ()\-\/]{7,25}$/.test(phone);
    if (!phoneFormatOk || digits.length < 7 || digits.length > 15) {
      setFormStatus('phoneInvalid');
      form.elements.whatsapp.focus();
      return;
    }

    const data = {
      firstName: form.elements.firstName.value.trim(),
      lastName: form.elements.lastName.value.trim(),
      whatsapp: phone,
      service: formService.value,
      city: SITE_CONFIG.city,
      source: window.location.href,
      consent: true,
      consentText: 'Обработка персональных данных для связи по заявке (DSGVO)',
      createdAt: new Date().toISOString()
    };

    formSubmit.disabled = true;
    clearFormStatus();

    if (!SITE_CONFIG.formEndpoint) {
      console.info('[Стиль] Заявка (демо-режим):', data);
      setFormStatus('demoMode', true);
      formSubmit.disabled = false;
      return;
    }

    try {
      // Google Apps Script не отдаёт CORS-заголовки. Отправляем простой
      // urlencoded-запрос в режиме no-cors: скрипт прочитает e.parameter.data.
      const isAppsScript = /script\.google\.com/.test(SITE_CONFIG.formEndpoint);
      const payload = JSON.stringify(data);
      const options = isAppsScript
        ? {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ data: payload }).toString()
          }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: payload
          };

      const response = await fetch(SITE_CONFIG.formEndpoint, options);
      if (!isAppsScript && !response.ok) throw new Error(`HTTP ${response.status}`);

      modalFormView.hidden = true;
      formSuccess.hidden = false;
      lastSuccessService = data.service;
      successText.textContent = data.service
        ? t('successWithService', { service: displayServiceLabel(data.service) })
        : t('successPlain');
    } catch (error) {
      console.error('[Стиль] Ошибка отправки заявки:', error);
      setFormStatus('sendError');
    } finally {
      formSubmit.disabled = false;
    }
  });

  /* ---------- Мобильное меню ---------- */
  const header = document.getElementById('header');
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');

  const closeNav = () => {
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', t('navOpen'));
  };

  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', t(isOpen ? 'navClose' : 'navOpen'));
  });

  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNav));

  document.addEventListener('click', event => {
    if (!header.contains(event.target)) closeNav();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNav();
  });

  /* ---------- Скролл: шапка, прогресс, плавающая кнопка ---------- */
  const progressBar = document.getElementById('progressBar');
  const fab = document.querySelector('.fab');
  let ticking = false;

  const onScrollFrame = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;

    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    header.classList.toggle('scrolled', scrollTop > 40);
    fab.classList.toggle('show', scrollTop > window.innerHeight * 0.8);

    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(onScrollFrame);
      ticking = true;
    }
  }, { passive: true });
  onScrollFrame();

  /* ---------- Появление блоков ---------- */
  const revealItems = document.querySelectorAll('[data-reveal]');

  if ('IntersectionObserver' in window && !reduceMotion) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    revealItems.forEach(item => revealObserver.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }

  /* ---------- Счётчики ---------- */
  const counters = document.querySelectorAll('[data-count]');

  const animateCount = el => {
    const target = Number(el.dataset.count) || 0;
    const duration = 1100;
    const start = performance.now();

    const step = now => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if ('IntersectionObserver' in window && !reduceMotion) {
    const countObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });

    counters.forEach(el => countObserver.observe(el));
  }

  /* ---------- Parallax ---------- */
  const parallaxItems = document.querySelectorAll('[data-parallax]');

  if (!reduceMotion && parallaxItems.length) {
    let parallaxTicking = false;

    const updateParallax = () => {
      const vh = window.innerHeight;
      parallaxItems.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        const speed = parseFloat(el.dataset.parallax) || 0;
        const offset = (rect.top + rect.height / 2 - vh / 2) * speed;
        el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      });
      parallaxTicking = false;
    };

    window.addEventListener('scroll', () => {
      if (!parallaxTicking) {
        requestAnimationFrame(updateParallax);
        parallaxTicking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', updateParallax);
    updateParallax();
  }

  /* ---------- Подсветка активного пункта меню ---------- */
  const navLinks = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = navLinks
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(section => sectionObserver.observe(section));
  }

  /* ---------- Применение языка ---------- */
  function applyTranslations() {
    document.documentElement.lang = currentLang;

    textNodes.forEach(node => {
      const original = node.__stilyOriginal;
      const key = original.trim();
      if (currentLang === 'de' && I18N.de[key]) {
        node.nodeValue = original.replace(key, I18N.de[key]);
      } else {
        node.nodeValue = original;
      }
    });

    attrNodes.forEach(({ el, attr, original }) => {
      const translated = currentLang === 'de'
        ? (I18N.attrs.de[original] || original)
        : original;
      el.setAttribute(attr, translated);
    });

    document.title = t('Стиль — бытовые услуги в Берлине. Официально, чек, страховка');
    if (meta) {
      meta.setAttribute('content', t('Русскоязычный мастер в Берлине. Сантехника, электрика, сборка мебели. Оценка по фото за 5 минут, фиксированная цена, приезд в окно 60 минут, чек и гарантия 6 месяцев.'));
    }

    document.querySelectorAll('[data-city]').forEach(el => {
      el.textContent = localizedCity();
    });

    renderServiceOptions();
    calcUpdaters.forEach(update => update());

    navToggle.setAttribute('aria-label', t(nav.classList.contains('open') ? 'navClose' : 'navOpen'));

    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      const active = btn.dataset.langBtn === currentLang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    if (formStatus.dataset.msgKey) {
      formStatus.textContent = t(formStatus.dataset.msgKey);
    }
    if (!formSuccess.hidden) {
      successText.textContent = lastSuccessService
        ? t('successWithService', { service: displayServiceLabel(lastSuccessService) })
        : t('successPlain');
    }
  }

  function setLanguage(lang) {
    if (lang !== 'ru' && lang !== 'de') return;
    currentLang = lang;
    try {
      localStorage.setItem('stil-lang', lang);
    } catch (ignored) {
      // Сохранение необязательно.
    }
    applyTranslations();
  }

  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.langBtn));
  });

  applyTranslations();
});
