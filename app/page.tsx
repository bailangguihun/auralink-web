import type { Metadata } from "next";
import Link from "next/link";

import { ArrowIcon } from "@/components/icons";
import { HomeHero } from "@/components/home-hero";
import { HomeScreens } from "@/components/home-screens";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "首页" };

const features = [
  { href: "/gallery", title: "画廊", description: "浏览中国画作品、每日推荐与作品详情。" },
  { href: "/studio", title: "创作工坊", description: "从笔墨与意境出发，探索艺术创作的灵感。" },
  { href: "/knowledge", title: "知识库", description: "探索中国画知识、作品资料与文化关联。" },
  { href: "/community", title: "社区", description: "发现中国画欣赏、创作与交流的多元视角。" },
  { href: "/assistant", title: "助手", description: "围绕所选作品提问，结合作品资料理解中国画。" },
  { href: "/about", title: "关于", description: "了解 ArtLIVE 画智体的项目理念与设计。" },
] as const;

export default function HomePage() {
  return (
    <HomeScreens>
      <HomeHero />
      <section className="home-features" id="home-features" aria-labelledby="feature-title">
        <div className="home-features-scroll" tabIndex={0} role="region" aria-label="首页功能与项目介绍">
          <div className="home-features-content">
            <div className="section-heading">
              <h2 id="feature-title">从一幅画，进入文化世界</h2>
              <p>浏览作品、探索知识，从更多角度感受中国画。</p>
            </div>
            <div className="feature-grid">
              {features.map((feature) => (
                <Link className="feature-card glass-panel" href={feature.href} key={feature.href} prefetch={false}>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                  <ArrowIcon />
                </Link>
              ))}
            </div>
            <a className="home-return" href="#home-welcome"><ArrowIcon direction="up" width={18} height={18} />返回开屏</a>
          </div>
          <SiteFooter />
        </div>
      </section>
    </HomeScreens>
  );
}
