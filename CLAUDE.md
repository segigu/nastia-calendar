# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nastia Calendar** is a personal menstrual cycle tracking PWA built with React + TypeScript. The app features cycle tracking, AI-generated insights, astrology integration, interactive storytelling, and cloud sync via GitHub.

**Live app**: https://segigu.github.io/nastia-calendar/

## Workflow Methodology

Следуй универсальной методологии работы из глобального руководства: [~/.claude/docs/CLAUDE_WORKFLOW.md](~/.claude/docs/CLAUDE_WORKFLOW.md)

**Глобальные команды доступны в этом проекте:**
- `/format-task` - Форматирование неформальных задач в структурированный вид
- `/make-plan` - Создание детального плана реализации с TodoList
- `/code-review` - Комплексная проверка кода перед коммитом
- `/update-docs` - Автоматическое обновление документации

**Системные команды Claude Code:**
- `/review` - встроенная команда code review
- `/help` - встроенная справка Claude Code

## Development Commands

### Core Commands
```bash
npm start          # Development server on localhost:3000
npm run build      # Production build
npm test           # Run Jest tests
npm run deploy     # Build and deploy to GitHub Pages
```

### Testing Specific Components
```bash
npm test -- --testPathPattern=<component-name>
npm test -- --watch  # Watch mode for test development
```

### Quick Workflow (КПД)
```bash
# КПД = Коммит, Пуш, Деплой - быстрая команда для публикации изменений
git add . && git commit -m "your message" && git push && npm run deploy
```

## Architecture Overview

### Entry Points
- [src/index.tsx](src/index.tsx) → [src/App.tsx](src/App.tsx) → [src/components/ModernNastiaApp.tsx](src/components/ModernNastiaApp.tsx)
- Main app component: `ModernNastiaApp` (~1500 lines) - handles all UI state, tabs, modals, and data flow

### Data Flow & Storage
- **Local storage**: [src/utils/storage.ts](src/utils/storage.ts) - localStorage with JSON serialization, horoscope memory, psychological contract history
- **Cloud sync**: [src/utils/cloudSync.ts](src/utils/cloudSync.ts) - GitHub API integration for cross-device sync using personal access tokens
- **Data structure**: [src/types/index.ts](src/types/index.ts) defines `NastiaData` with `cycles`, `settings`, `horoscopeMemory`, `psychContractHistory`

### AI Integration
- **Unified client**: [src/utils/aiClient.ts](src/utils/aiClient.ts) - Auto-fallback from Claude (primary) to OpenAI (fallback)
- **Content generation**:
  - [src/utils/aiContent.ts](src/utils/aiContent.ts) - Period modal content generation
  - [src/utils/insightContent.ts](src/utils/insightContent.ts) - Daily insight descriptions
  - [src/utils/historyStory.ts](src/utils/historyStory.ts) - Interactive story generation with psychological contracts
- **Configuration**: Uses `REACT_APP_CLAUDE_API_KEY`, `REACT_APP_CLAUDE_PROXY_URL`, `REACT_APP_OPENAI_API_KEY` env vars
- **IMPORTANT**: Always use model **`claude-haiku-4-5`** (Haiku 4.5) for all Claude API requests - it provides the best balance of speed and quality for this application

### Astrology Features
- **Natal charts**: [src/utils/astro.ts](src/utils/astro.ts) - Uses `astronomy-engine` for planetary positions, aspects, houses
- **Profiles**: [src/data/astroProfiles.ts](src/data/astroProfiles.ts) - Pre-defined natal chart configurations
- **Horoscopes**: [src/utils/horoscope.ts](src/utils/horoscope.ts) - Daily/weekly horoscope generation with memory system
- **Integration**: Horoscope memory (`HoroscopeMemoryEntry[]`) tracks past readings to maintain narrative consistency

### Interactive History/Storytelling
- **Core logic**: [src/utils/historyStory.ts](src/utils/historyStory.ts)
- **Psychological contracts**: [src/data/psychologicalContracts.ts](src/data/psychologicalContracts.ts) - Narrative frameworks with scenarios
- **History tracking**: [src/utils/psychContractHistory.ts](src/utils/psychContractHistory.ts) - Remembers used contracts/scenarios to avoid repetition
- **Flow**: User sees story segments → picks options → AI generates next segment based on contract + astro context + previous choices

### Push Notifications
- **Main API**: [src/utils/pushNotifications.ts](src/utils/pushNotifications.ts) - VAPID keys, subscription management
- **Service worker**: [src/service-worker.ts](src/service-worker.ts) - Handles push events, caching
- **Sync utilities**:
  - [src/utils/pushSubscriptionSync.ts](src/utils/pushSubscriptionSync.ts) - Sync subscriptions to GitHub
  - [src/utils/notificationsSync.ts](src/utils/notificationsSync.ts) - Fetch remote notifications
  - [src/utils/notificationsStorage.ts](src/utils/notificationsStorage.ts) - Local notification storage

### Cycle Calculations
- [src/utils/cycleUtils.ts](src/utils/cycleUtils.ts) - Average length, fertile window, ovulation prediction
- [src/utils/dateUtils.ts](src/utils/dateUtils.ts) - Date formatting, comparison utilities

### UI Components
- **Main app**: [src/components/ModernNastiaApp.tsx](src/components/ModernNastiaApp.tsx) + [src/components/NastiaApp.module.css](src/components/NastiaApp.module.css)
- **Tab navigation**: [src/components/GlassTabBar.tsx](src/components/GlassTabBar.tsx) - Glass morphism bottom tab bar
- **Chart**: [src/components/CycleLengthChart.tsx](src/components/CycleLengthChart.tsx) - Uses Recharts for cycle visualization
- **Mini calendar**: [src/components/MiniCalendar.tsx](src/components/MiniCalendar.tsx) + [src/components/MiniCalendar.module.css](src/components/MiniCalendar.module.css) - Compact month calendar widget for cycle list items

## Critical Design Rules (DO NOT MODIFY)

### Glass Tab Bar Styling
**File**: [src/components/GlassTabBar.module.css](src/components/GlassTabBar.module.css)

**NEVER change these values** without explicit approval:
```css
/* .glassTabBar */
margin: 12px 32px;
padding: 6px;
border-radius: 40px;
background: rgba(253, 242, 248, 0.12);
backdrop-filter: blur(16px) saturate(180%) brightness(105%);
border: 1px solid rgba(255, 255, 255, 0.8);

/* .tabButton */
gap: 3px;
padding: 6px 4px;
min-height: 52px;
```

**Rationale**: These parameters were meticulously tuned for iOS-style glass morphism with optimal transparency and content visibility. See [DESIGN_RULES.md](DESIGN_RULES.md) for full details.

### Auto-scroll in Interactive History
**File**: [src/components/ModernNastiaApp.tsx](src/components/ModernNastiaApp.tsx:1350-1392)

**Critical rule**: Always scroll `window`, NOT the container!

```tsx
// ✅ CORRECT
window.scrollTo({
  top: document.documentElement.scrollHeight,
  behavior: 'smooth'
});

// ❌ INCORRECT - container doesn't have overflow: scroll
container.scrollTo({ ... });
```

**Implementation**:
- Two separate `useEffect` hooks for different story phases (`generating` and `ready`)
- Triple `requestAnimationFrame` to ensure DOM elements are fully rendered before scrolling
- See [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md) for complete technical explanation

### Modal Window Structure
**File**: [src/components/NastiaApp.module.css](src/components/NastiaApp.module.css)

All modals follow this pattern:
- Use `styles.modal` wrapper for full-screen overlay
- Content uses `styles.modalContent` + specific modifier (e.g., `styles.settingsModal`)
- Always set: `width: 100%`, `height: 100vh`, `min-height: 100vh`, `margin: 0`, `border-radius: 0`
- Include `animation: slideUpSettings 0.3s ease-out;` for bottom-up entrance
- Header with close button (`.closeButton`, `.closeButtonLight` for light backgrounds)
- Scrollable content area inside modal body

### Cycle List Mini Calendar Design (Two-Zone Layout)
**Files**:
- [src/components/MiniCalendar.tsx](src/components/MiniCalendar.tsx)
- [src/components/MiniCalendar.module.css](src/components/MiniCalendar.module.css)
- [src/components/NastiaApp.module.css](src/components/NastiaApp.module.css) (`.cycleItem`)
- [public/images/calendar-months/](public/images/calendar-months/) - month images directory

**NEVER change these design parameters** without explicit approval (see [DESIGN_RULES.md](DESIGN_RULES.md)):

#### Two-Zone Layout Structure

```tsx
// MiniCalendar.tsx structure
<div className={styles.miniCalendar}>
  {/* Left zone: Calendar grid (2/3 width) */}
  <div className={styles.calendarContent}>
    <div className={styles.monthName}>Январь 2025</div>
    <div className={styles.weekDays}>...</div>
    <div className={styles.daysGrid}>...</div>
  </div>

  {/* Right zone: Month image (1/3 width) */}
  {imageUrl && (
    <div className={styles.imageContainer}>
      <img src={imageUrl} className={styles.image} />
      {onDelete && (
        <button className={styles.deleteButton}>
          {/* Trash icon */}
        </button>
      )}
    </div>
  )}
</div>
```

#### Critical CSS Parameters

```css
/* MiniCalendar.module.css */
.miniCalendar {
  display: flex;
  align-items: stretch;  /* Both zones same height */
  width: 100%;
  max-width: 100%;
  /* NO overflow: hidden - clips hand-drawn circle */
}

.calendarContent {
  flex: 0 0 66.67%;  /* Exactly 2/3 width */
  padding: 0.75rem 1rem;
  border-top-left-radius: 1rem;
  border-bottom-left-radius: 1rem;
  box-sizing: border-box;
}

.monthName {
  font-size: 13px;
  font-weight: 700;
  color: #000000;  /* Black, NOT purple */
  text-align: left;
}

.imageContainer {
  position: relative;  /* For absolute delete button */
  flex: 0 0 33.33%;  /* Exactly 1/3 width */
  padding: 0;
  border-top-right-radius: 1rem;
  border-bottom-right-radius: 1rem;
  overflow: hidden;  /* ONLY here, rounds image corners */
  box-sizing: border-box;
}

.image {
  width: 100%;
  height: 100%;
  object-fit: cover;  /* Fills entire container */
  object-position: center center;
  display: block;
}

.deleteButton {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  color: #666;  /* Gray, NOT blue */
  z-index: 10;
}
```

#### Hand-drawn Circle SVG

```tsx
// Appears on target day only
{dayInfo.isTarget && (
  <svg className={styles.handDrawnCircle} viewBox="0 0 50 50">
    <path
      d="M 8,25 Q 7,15 15,8 T 25,6 Q 35,5.5 42,13 T 45,25 Q 45.5,35 38,42 T 28,45 Q 18,45.5 11,38 T 8,28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)}
```

**Circle styling**:
```css
.handDrawnCircle {
  position: absolute;
  width: 140%;  /* Overflows cell */
  height: 140%;
  transform: translate(-50%, -50%);
  color: var(--nastia-red);
  opacity: 0.8;
  animation: drawCircle 0.6s ease-out;
}
```

#### Auto-loading Month Images

**Integration** (ModernNastiaApp.tsx:~4590):
```tsx
const cycleDate = new Date(cycle.startDate);
const monthNumber = (cycleDate.getMonth() + 1).toString().padStart(2, '0');
const monthImageUrl = `${process.env.PUBLIC_URL}/images/calendar-months/${monthNumber}.png`;

<MiniCalendar
  date={cycleDate}
  imageUrl={monthImageUrl}
  onDelete={() => deleteCycle(cycle.id)}
/>
```

**Image directory structure**:
```
public/images/calendar-months/
├── 01.png  - January
├── 02.png  - February
├── ...
├── 12.png  - December
└── default.png  - Fallback if image fails to load
```

**Fallback logic** (MiniCalendar.tsx):
```tsx
<img
  src={imageUrl}
  onError={(e) => {
    const target = e.target as HTMLImageElement;
    target.src = `${process.env.PUBLIC_URL}/images/calendar-months/default.png`;
  }}
/>
```

**Image requirements**:
- Format: PNG only (not JPG)
- Recommended size: ~500×1000px (vertical orientation)
- Max file size: 500KB per image
- Transparency: Supported

#### Rationale

1. **66.67% / 33.33% proportions**: Optimal balance for mobile (iPhone 375px width) - calendar remains readable, image provides visual interest without dominating
2. **Black month name**: Maximum contrast on light backgrounds, doesn't compete with red circle
3. **Image fills 100% of container**: No visual gaps, professional look with `object-fit: cover`
4. **overflow: hidden ONLY on imageContainer**: Allows hand-drawn circle (140% size) to overflow cell without clipping
5. **Delete button over image**: Space-efficient, intuitive placement for deleting entire cycle
6. **Hand-drawn circle**: Quadratic Bézier curves (Q, T) create organic aesthetic, animation (0.6s ease-out) provides satisfying feedback
7. **Auto-mapping by month**: `startDate` month → `{01-12}.png`, seamless integration without manual configuration

#### Common Mistakes

❌ **Don't add `overflow: hidden` to `.miniCalendar` or `.cycleItem`** - clips the hand-drawn circle
❌ **Don't use fixed pixel widths** - breaks on different screen sizes
❌ **Don't change month name color back to purple** - reduces contrast
❌ **Don't use JPG format for images** - PNG required for consistency

## Environment Variables

Required for full functionality:

```bash
# AI API Keys (at least one required)
REACT_APP_CLAUDE_API_KEY=sk-ant-...
REACT_APP_CLAUDE_PROXY_URL=https://your-proxy.com/v1/messages
REACT_APP_OPENAI_API_KEY=sk-...

# GitHub Pages deployment
PUBLIC_URL=https://segigu.github.io/nastia-calendar
```

## Data Storage Keys

localStorage keys used:
- `nastia-app-data` - Main app data (cycles, settings, horoscope memory, psych history)
- `nastia-cloud-config` - Cloud sync configuration
- `nastia-notification-settings` - Push notification preferences
- `nastia-push-subscription` - Push subscription data
- `nastia-notifications-local` - Local notifications cache
- `nastia-notifications-read-set` - Read notification IDs

## Important Files

### Documentation
- [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md) - Detailed technical documentation
- [DESIGN_RULES.md](DESIGN_RULES.md) - Critical design rules (DO NOT VIOLATE)
- [DISCOVER_TAB.md](DISCOVER_TAB.md) - "Узнай себя" tab complete documentation (DiscoverTabV2)
- [AUTOSCROLL_FIX.md](AUTOSCROLL_FIX.md) - Auto-scroll implementation details
- [VOICE_RECORDING.md](VOICE_RECORDING.md) - Voice recording functionality ("Свой вариант" button)
- [CLOUD_SETUP.md](CLOUD_SETUP.md) - User guide for cloud sync setup
- [PUSH_NOTIFICATIONS_SETUP.md](PUSH_NOTIFICATIONS_SETUP.md) - Push notifications setup
- [PROJECT_HISTORY.md](PROJECT_HISTORY.md) - Development history

### Configuration
- [nastia-config.example.json](nastia-config.example.json) - Example config structure
- [tsconfig.json](tsconfig.json) - TypeScript configuration

## Key Features to Understand

### Horoscope Memory System
The app maintains conversation continuity across horoscope sessions:
1. Each horoscope (daily/weekly) generates a `HoroscopeMemoryEntry` with summary, key themes, phrases to avoid
2. Stored in `NastiaData.horoscopeMemory[]`
3. When generating new content, past memories are included in prompts to maintain consistency
4. Merging logic in [src/utils/horoscope.ts](src/utils/horoscope.ts) prevents duplicates

### Psychological Contract History
Interactive stories use contracts to avoid repetition:
1. Contracts and scenarios tracked in `PsychContractHistory`
2. Limits: 10 contracts, 30 scenarios, 5 scenarios per contract
3. When generating stories, recently used contracts/scenarios are deprioritized
4. Normalization in [src/utils/storage.ts](src/utils/storage.ts) enforces limits

### Cloud Sync Flow
1. User provides GitHub personal access token (via URL param or settings)
2. App creates/updates `nastia-cycles.json` in private `nastia-data` repo
3. Automatic sync on app load if cloud is configured
4. Manual sync button for force refresh
5. Local storage always maintained as backup

### Discover Tab ("Узнай себя")
**⚠️ See [DISCOVER_TAB.md](DISCOVER_TAB.md) for complete documentation**

Interactive psychological game with astrology and voice recording:
1. **Lifecycle**: Idle Screen → Planet Dialogue → Interactive Story (7 arcs) → Finale
2. **Architecture**: DiscoverTabV2 → ChatManager → ChatChoices (centralized state management)
3. **Planet Dialogue**: Personalized animated dialogue (based on natal chart) while AI generates story
4. **Interactive Story**: User makes 7 choices, AI generates segments using psychological contracts
5. **Finale**: Dual interpretation (human + astrological) of user's choices
6. **Reveal Scroll**: Special scroll mechanism - show all buttons → scroll back to message start
7. **Voice Recording**: "Свой вариант" button for recording custom story continuations

**URL for testing v2**: `?newDiscover=true` (старая версия без параметра)

**Critical rules**:
- Always use `window.scrollTo()`, NOT `container.scrollTo()` (no overflow on container)
- Reveal scroll timing: 500ms/button animation + 800ms pause before scroll back
- Padding-bottom: 16px prevents overlap with glass tab bar

### Voice Recording ("Свой вариант")
**⚠️ CRITICAL: Props-based architecture - see [VOICE_RECORDING.md](VOICE_RECORDING.md) for full details**

The "Свой вариант" button allows users to record their own story continuation via voice:
1. **State ownership**: `DiscoverTabV2` owns `customOption`, `customStatus`, `customRecordingLevel`
2. **Props flow**: State passed as props → `ChatManager` → `ChatChoices` (NO state in intermediaries!)
3. **Recording flow**: MediaRecorder API → Whisper transcription → AI generation (title/description)
4. **States**: idle → recording → transcribing → generating → ready/error

**Common mistake**: Using `setChoices()` in useEffect creates infinite loop. Always pass state via props!

## Testing Notes

- Tests use `@testing-library/react` and Jest
- Run tests before deployment
- Service worker caching can affect tests - clear cache if issues occur

## Deployment

```bash
npm run deploy
```

This builds the app and deploys to GitHub Pages (`gh-pages` branch). The live URL is configured in `package.json` homepage field.

## Common Pitfalls

1. **Don't modify glass tab bar CSS** without reading [DESIGN_RULES.md](DESIGN_RULES.md)
2. **Don't change window.scrollTo to container.scrollTo** in history auto-scroll
3. **Always test AI fallback** - ensure both Claude and OpenAI keys work or graceful degradation occurs
4. **Handle Date serialization** - localStorage converts Date to string, always deserialize in `loadData()`
5. **Modal structure** - follow existing pattern for consistency
6. **Horoscope memory** - don't exceed reasonable limits, implement pruning if needed
7. **Push notifications** - require HTTPS in production, test locally with `localhost`

## Color Palette

```css
--nastia-pink: #FFB6C1;      /* Light Pink */
--nastia-purple: #DDA0DD;    /* Plum */
--nastia-light: #FFF0F5;     /* Lavender Blush */
--nastia-dark: #8B008B;      /* Dark Magenta */
--nastia-red: #ff6b9d;       /* Period days */
```

## Support & Issues

This is a personal project. Refer to documentation files for detailed information on specific features.
