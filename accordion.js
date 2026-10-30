document.querySelectorAll('.faq-list details').forEach((details) => {
  const summary = details.querySelector('summary');
  let animation;
  let expanded = details.open;

  summary.addEventListener('click', (event) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();

    expanded = animation ? !expanded : !details.open;
    const from = details.getBoundingClientRect().height;
    animation?.cancel();
    details.style.height = '';
    details.open = expanded;
    const to = details.getBoundingClientRect().height;
    details.open = true;
    details.style.height = `${from}px`;
    details.style.overflow = 'hidden';

    animation = details.animate(
      { height: [`${from}px`, `${to}px`] },
      { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' },
    );
    animation.onfinish = () => {
      details.open = expanded;
      details.style.height = '';
      details.style.overflow = '';
      animation = undefined;
    };
  });
});
