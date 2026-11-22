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

document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Подстановка города и ссылок ---------- */
  document.querySelectorAll('[data-city]').forEach(el => {
    el.textContent = SITE_CONFIG.city;
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

  document.querySelectorAll('.calc').forEach(calc => {
    const select = calc.querySelector('[data-calc-select]');
    const priceEl = calc.querySelector('[data-calc-price]');
    const cta = calc.querySelector('[data-calc-cta]');
    if (!select || !priceEl || !cta) return;

    const update = () => {
      const option = select.options[select.selectedIndex];
      const service = option.dataset.label || option.textContent.trim();
      const price = option.dataset.price || '';

      priceEl.textContent = price;
      cta.setAttribute('aria-label', `Написать с расчётом: ${service}`);
      cta.href = buildContactUrl(
        `Здравствуйте! Интересует «${service}» в ${SITE_CONFIG.city}. ` +
        `Ориентировочная стоимость по прайсу: ${price}. Прошу подтвердить точную сумму по фото.`
      );
      cta.setAttribute('target', '_blank');
      cta.setAttribute('rel', 'noopener noreferrer');
    };

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

  // Список услуг собирается из карточек прайса — данные не дублируются.
  document.querySelectorAll('.price-card').forEach(card => {
    const category = card.querySelector('.price-head h3')?.textContent.trim() || 'Услуги';
    const group = document.createElement('optgroup');
    group.label = category;

    card.querySelectorAll('[data-calc-select] option').forEach(option => {
      const label = `${option.dataset.label || option.textContent.trim()} — ${option.dataset.price || ''}`.trim();
      const item = document.createElement('option');
      item.value = label;
      item.textContent = label;
      group.appendChild(item);
    });

    if (group.children.length) formService.appendChild(group);
  });

  const openModal = (trigger, service = '') => {
    lastFocused = trigger || document.activeElement;
    form.reset();
    formService.value = service;
    formCity.value = SITE_CONFIG.city;
    formStatus.textContent = '';
    formStatus.classList.remove('ok');
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
      formStatus.textContent = 'Выберите услугу из списка.';
      formService.focus();
      return;
    }
    if (!form.elements.consent.checked) {
      formStatus.textContent = 'Для отправки заявки нужно согласие на обработку персональных данных (DSGVO).';
      form.elements.consent.focus();
      return;
    }
    if (!form.reportValidity()) return;

    const phone = form.elements.whatsapp.value.trim();
    const digits = phone.replace(/\D/g, '');
    const phoneFormatOk = /^\+?[0-9 ()\-\/]{7,25}$/.test(phone);
    if (!phoneFormatOk || digits.length < 7 || digits.length > 15) {
      formStatus.textContent = 'Некорректный номер: только цифры, +, пробелы, скобки и дефис (от 7 до 15 цифр).';
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
    formStatus.textContent = '';
    formStatus.classList.remove('ok');

    if (!SITE_CONFIG.formEndpoint) {
      console.info('[Стиль] Заявка (демо-режим):', data);
      formStatus.classList.add('ok');
      formStatus.textContent = 'Демо-режим: данные не отправлены. Укажите formEndpoint в script.js.';
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
      successText.textContent = data.service
        ? `Заявка по услуге «${data.service}» принята. Мастер свяжется с вами в ближайшее время.`
        : 'Мастер свяжется с вами в ближайшее время.';
    } catch (error) {
      console.error('[Стиль] Ошибка отправки заявки:', error);
      formStatus.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз или напишите в WhatsApp.';
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
    navToggle.setAttribute('aria-label', 'Открыть меню');
  };

  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
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
});
