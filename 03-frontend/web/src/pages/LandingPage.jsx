import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDown, Store, ShoppingBag, Compass } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { BrandMark } from "../components/brand/BrandMark.jsx";
import { MotionControl } from "../components/brand/MotionControl.jsx";
import { LanguageSwitcher } from "../components/layout/LanguageSwitcher.jsx";

const content = {
  ar: {
    nav: ["عالم Restrova", "منتجاتنا", "رحلتك"],
    login: "دخول",
    tag: "من جدة • لطموح كل مطعم",
    title: ["وراء كل طبق", "حكاية نجاح.", "خلّ أرقامك تحكيها."],
    body: "أنت تصنع المذاق. وريستروفا يجمع المبيعات والتكاليف في صورة أوضح، لتعرف أين يقف مطعمك وما خطوتك القادمة.",
    cta: "اكتشف Restrova Business",
    explore: "تعرّف على عالمنا",
    strip: "إدارة. تواصل. اكتشاف.",
    products: "ثلاث مساحات. رؤية واحدة.",
    intro: "من قرارك اليومي إلى علاقاتك الجديدة. عالم ينمو مع طموح مطعمك.",
    cards: ["إدارة أوضح، كل يوم.", "علاقات تصنع الفرق.", "لكل مذاق حكاية."],
    descs: [
      "تابع المبيعات والتكاليف، استورد بياناتك، واستكشف أداء مطعمك في مساحة واحدة.",
      "مساحة مرتقبة تجمع المطاعم بالمورّدين وتفتح آفاقًا جديدة للتعاون.",
      "وجهة مرتقبة لاكتشاف المطاعم وقوائمها وعروضها وتجارب زوّارها."
    ],
    available: "استكشف Business",
    soon: "قيد التطوير",
    journey: "من التفاصيل إلى القرار.",
    steps: ["اجمع بياناتك", "افهم الصورة", "اختر خطوتك"],
    stepdesc: [
      "اربط يومك بالأرقام عبر أدوات الاستيراد الموجودة.",
      "استكشف مؤشراتك وتقاريرك في واجهة واضحة.",
      "راجع التوصيات والأدلة واتخذ القرار المناسب لمطعمك."
    ],
    end: "قصّة نجاحك تبدأ بخطوة.",
    note: "Market وDiscover قيد التطوير. الوظائف المتاحة حاليًا ضمن Restrova Business.",
    skip: "تجاوز إلى المحتوى"
  },
  en: {
    nav: ["Our world", "Our products", "Your journey"],
    login: "Sign in",
    tag: "FROM JEDDAH. FOR YOUR NEXT CHAPTER.",
    title: ["GOOD FOOD.", "CLEAR NUMBERS.", "BETTER DECISIONS."],
    body: "You bring the flavour. Restrova brings sales, costs and restaurant performance into focus, so your next decision starts with clarity.",
    cta: "Explore Restrova Business",
    explore: "Meet our world",
    strip: "MANAGE. CONNECT. DISCOVER.",
    products: "THREE SPACES. ONE VISION.",
    intro: "From everyday decisions to new connections. A world that grows with your restaurant.",
    cards: ["A clearer everyday.", "Better connections.", "Every taste, a story."],
    descs: [
      "Explore sales and costs, import your data, and understand restaurant performance in one workspace.",
      "A future space connecting restaurants and suppliers, with new possibilities for collaboration.",
      "A future destination for restaurants, menus, offers and guest experiences."
    ],
    available: "Explore Business",
    soon: "In development",
    journey: "FROM DETAIL TO DECISION.",
    steps: ["Bring your data", "See the picture", "Choose your next step"],
    stepdesc: [
      "Bring your numbers together with the existing import tools.",
      "Explore your metrics and reports in a clear workspace.",
      "Review recommendations and evidence to make your own informed decisions."
    ],
    end: "YOUR NEXT CHAPTER STARTS HERE.",
    note: "Market and Discover are in development. Current functionality is available through Restrova Business.",
    skip: "Skip to content"
  },
  "zh-CN": {
    nav: ["我们的世界", "我们的产品", "您的旅程"],
    login: "登录",
    tag: "从吉达出发，开启新的篇章",
    title: ["好味道。", "大梦想。", "您的世界。"],
    body: "每家餐厅都有自己的故事。看清经营细节，把时间留给热爱，让下一步更有方向。",
    cta: "探索 Restrova Business",
    explore: "了解我们的世界",
    strip: "经营。连接。发现。",
    products: "三个空间，一个愿景。",
    intro: "从日常决策到新的连接，与您的餐厅共同成长。",
    cards: ["每天更清晰。", "更好的连接。", "每种味道都有故事。"],
    descs: [
      "查看销售与成本，导入数据，在一个工作空间了解餐厅表现。",
      "未来连接餐厅和供应商的合作空间。",
      "未来发现餐厅、菜单、优惠和顾客体验的目的地。"
    ],
    available: "探索 Business",
    soon: "开发中",
    journey: "从细节到决策。",
    steps: ["汇集数据", "看清全局", "选择下一步"],
    stepdesc: [
      "使用现有导入工具整理经营数据。",
      "在清晰的工作空间查看指标与报告。",
      "审阅建议与依据，做出适合餐厅的决定。"
    ],
    end: "新的篇章，从这里开始。",
    note: "Market 和 Discover 正在开发中。当前功能通过 Restrova Business 提供。",
    skip: "跳至内容"
  }
};

export function LandingPage() {
  const { locale } = useLocale();
  const c = content[locale] || content.en;
  return (
    <div className="world-page">
      <a className="world-skip" href="#world-main">
        {c.skip}
      </a>
      <header className="world-header">
        <Link className="world-logo" to="/" aria-label="Restrova">
          <BrandMark size={38} />
          <span>
            RESTROVA<small>BUSINESS · MARKET · DISCOVER</small>
          </span>
        </Link>
        <nav aria-label={c.nav[0]}>
          {c.nav.map((label, i) => (
            <a key={label} href={["#world", "#products", "#journey"][i]}>
              {label}
            </a>
          ))}
        </nav>
        <div className="world-controls">
          <MotionControl />
          <LanguageSwitcher compact />
          <Link className="world-login" to="/login">
            {c.login}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main id="world-main">
        <section className="world-hero" id="world">
          <div className="world-hero-copy">
            <p className="world-eyebrow">
              <i />
              {c.tag}
            </p>
            <h1>
              {c.title.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </h1>
            <p className="world-description">{c.body}</p>
            <div className="world-actions">
              <Link className="world-button" to="/login">
                {c.cta}
                <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
              <a href="#products">
                {c.explore}
                <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="world-location" lang="en">
              JEDDAH / SAUDI ARABIA <span>21.4858° N · 39.1925° E</span>
            </p>
          </div>
          <div className="world-art">
            <span className="world-ring" aria-hidden="true" />
            <img
              src="/images/restrova/restaurant-still-life.webp"
              width="1536"
              height="1024"
              alt=""
              fetchPriority="high"
            />
            <div className="world-art-tags" aria-hidden="true">
              {c.steps.map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
            <span className="world-art-label" lang="en">
              FROM THE PLATE. TO THE BIG PICTURE. ↗
            </span>
          </div>
        </section>
        <div className="world-ribbon" aria-label={c.strip}>
          <span>{c.strip}</span>
          <b aria-hidden="true">✦</b>
          <span aria-hidden="true">{c.strip}</span>
          <b aria-hidden="true">✦</b>
        </div>
        <section className="world-products" id="products">
          <div className="world-section-heading">
            <p className="world-eyebrow">01 / RESTROVA</p>
            <h2>{c.products}</h2>
            <p>{c.intro}</p>
          </div>
          <div className="world-product-grid">
            {[Store, ShoppingBag, Compass].map((Icon, i) => (
              <article className={`world-product world-product--${i}`} key={i}>
                <div className="world-product-art">
                  <span className="world-product-number">0{i + 1}</span>
                  {i === 0 ? (
                    <img
                      src="/images/restrova/restaurant-still-life.webp"
                      alt=""
                      width="1536"
                      height="1024"
                      loading="lazy"
                    />
                  ) : (
                    <Icon size={96} strokeWidth={1} aria-hidden="true" />
                  )}
                  <span lang="en">RESTROVA / {["BUSINESS", "MARKET", "DISCOVER"][i]}</span>
                </div>
                <div className="world-product-copy">
                  <h3>{c.cards[i]}</h3>
                  <p>{c.descs[i]}</p>
                  {i === 0 ? (
                    <Link to="/login">
                      {c.available}
                      <ArrowUpRight size={19} aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="world-status">{c.soon}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="world-journey" id="journey">
          <div className="world-section-heading">
            <p className="world-eyebrow">02 / YOUR NEXT CHAPTER</p>
            <h2>{c.journey}</h2>
          </div>
          <ol>
            {c.steps.map((s, i) => (
              <li key={s}>
                <span>0{i + 1}</span>
                <h3>{s}</h3>
                <p>{c.stepdesc[i]}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="world-closing">
          <h2>{c.end}</h2>
          <Link className="world-button" to="/login">
            {c.cta}
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="world-footer">
        <strong lang="en">RESTROVA.</strong>
        <p>{c.note}</p>
        <a href="#world">↑ {c.nav[0]}</a>
      </footer>
    </div>
  );
}
