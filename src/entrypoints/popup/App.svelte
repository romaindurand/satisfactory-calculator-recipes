<script lang="ts">
  import { recipes as baseRecipes } from "@/recipes";
  import { formatDistanceToNow } from "date-fns";

  let isSatisfactoryMap = false;
  let isSatisfactoryCalculator = false;
  let alternateRecipes: string[] = [];
  let loading = false;
  let noSaveLoadedError = false;
  let lastUpdated = 0;
  let distanceToLastUpdated = "...";

  $: recipes = baseRecipes
    .map((recipe) => ({
      name: recipe,
      checked: alternateRecipes.includes(recipe),
    }))
    .sort((a, b) => {
      if (a.checked === b.checked) {
        return a.name.localeCompare(b.name);
      }
      return a.checked ? -1 : 1;
    });

  onMount(async () => {
    const activeTabUrl = await getActiveTabUrl();
    const origin = new URL(activeTabUrl).origin;
    if (origin === "https://satisfactory-calculator.com") {
      isSatisfactoryMap = true;
      await getRecipes();
    } else if (origin === "https://www.satisfactorytools.com") {
      isSatisfactoryCalculator = true;
    }

    alternateRecipes = await getStoredRecipesOrInitStore();
    lastUpdated = await getStoredLastUpdatedOrInitStore();
    setInterval(() => {
      distanceToLastUpdated = formatDistanceToNow(lastUpdated) + " ago";
    }, 1000);
  });

  async function getStoredRecipesOrInitStore() {
    const recipes = await storage.getItem<string[]>("sync:alternateRecipes");
    if (!recipes) {
      await storage.setItem("sync:alternateRecipes", []);
      return [];
    }
    return recipes;
  }

  async function getStoredLastUpdatedOrInitStore() {
    const lastUpdated = await storage.getItem<number>("sync:lastUpdated");
    if (!lastUpdated) {
      const now = Date.now();
      await storage.setItem("sync:lastUpdated", now);
      return now;
    }
    return lastUpdated;
  }

  async function getActiveTab() {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tabs[0];
  }

  async function getActiveTabUrl(): Promise<string> {
    const tab = await getActiveTab();
    return tab.url || "";
  }

  async function openMap() {
    loading = true;
    let mapTab;
    // TODO : check if map is already opened
    mapTab = (
      await browser.tabs.query({
        url: "https://satisfactory-calculator.com/en/interactive-map",
      })
    )?.[0];
    if (mapTab) {
      await browser.tabs.update(mapTab.id, { active: true });
      isSatisfactoryMap = true;
      isSatisfactoryCalculator = false;
      loading = false;
      return;
    }
    mapTab = await browser.tabs.create({
      url: "https://satisfactory-calculator.com/en/interactive-map",
    });
    isSatisfactoryCalculator = false;
    browser.tabs.onUpdated.addListener(
      async function listener(tabId, changeInfo) {
        if (tabId === mapTab.id && changeInfo.status === "complete") {
          browser.tabs.onUpdated.removeListener(listener);
          loading = false;
          isSatisfactoryMap = true;
        }
      }
    );
  }

  async function getRecipes() {
    const tab = await getActiveTab();
    if (!tab.id) return;

    const statsPanelOpenedExecutionResult =
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: getStatPanelOpenedStatus,
      });
    let isStatsPanelOpened = statsPanelOpenedExecutionResult[0].result;

    if (!isStatsPanelOpened) {
      // returns false if panel can't be opened (no save loaded)
      const openStatsPanelExecutionResult =
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: openStatsPanel,
        });
      if (!openStatsPanelExecutionResult[0].result) {
        noSaveLoadedError = true;
        return;
      } else noSaveLoadedError = false;
    }

    const recipesExecutionResult = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: getDOMRecipes,
    });
    alternateRecipes = recipesExecutionResult[0].result;
    await storage.setItem("sync:alternateRecipes", alternateRecipes);
    lastUpdated = Date.now();
    await storage.setItem("sync:lastUpdated", lastUpdated);
  }

  async function openStatsPanel() {
    const researchButton = document.querySelector(
      "#researchButton button"
    ) as HTMLButtonElement;
    if (!researchButton) return false;
    if (!researchButton.checkVisibility()) return false;
    researchButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const researchModal = document.querySelector(
      "#researchModal"
    ) as HTMLDivElement;
    researchModal.click();
    return true;
  }

  function getStatPanelOpenedStatus() {
    const isStatsPanelOpened =
      (document.querySelector("#statisticsModalAlternateRecipes")
        ?.childElementCount || 0) > 0;
    return isStatsPanelOpened;
  }

  function getDOMRecipes() {
    const recipes = [
      ...document.querySelectorAll(
        '#statisticsModalAlternateRecipes [data-status="purchased"]'
      ),
    ].map((i) =>
      i.parentElement!.children[1]!.textContent!.replace("Alternate: ", "")
    );
    return recipes;
  }

  async function openCalculator() {
    let calculatorTab;
    // TODO : check if calculator is already opened
    calculatorTab = (
      await browser.tabs.query({
        url: "https://www.satisfactorytools.com/1.0/production",
      })
    )?.[0];
    if (calculatorTab) {
      await browser.tabs.update(calculatorTab.id, { active: true });
      isSatisfactoryCalculator = true;
      isSatisfactoryMap = false;
      return;
    }
    calculatorTab = await browser.tabs.create({
      url: "https://www.satisfactorytools.com/1.0/production",
    });
    browser.tabs.onUpdated.addListener(
      async function listener(tabId, changeInfo) {
        if (tabId === calculatorTab.id && changeInfo.status === "complete") {
          browser.tabs.onUpdated.removeListener(listener);
          isSatisfactoryCalculator = true;
        }
      }
    );
  }

  async function checkRecipes() {
    const tab = await getActiveTab();
    if (!tab.id) return;
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      args: [alternateRecipes],
      func: checkRecipesScript,
    });
  }

  function checkRecipesScript(alternateRecipes: string[]) {
    const noneButton = document.querySelector<HTMLSpanElement>(
      'span.btn.btn-secondary.px-3[ng-click="ctrl.tab.setAllAlternateRecipes(false)"]'
    );
    if (noneButton) noneButton.click();
    alternateRecipes.forEach((r) =>
      (
        [
          ...document.querySelectorAll(
            ".recipe-list-card .alternate-recipe-list span.ng-binding"
          ),
        ]?.find((el) => el.textContent?.includes(r)) as HTMLSpanElement
      )?.click()
    );
  }
</script>

<main>
  {#if loading}
    <div>
      <div>Loading Map ...</div>
      <div class="loading"></div>
    </div>
  {:else}
    <div class="buttons">
      {#if isSatisfactoryCalculator}
        <button on:click={checkRecipes} class="primary"
          >Use Alternate Recipes</button
        >
      {:else}
        <button on:click={openCalculator}>Open Satisfactory Calculator</button>
      {/if}
      {#if !isSatisfactoryMap}
        <button on:click={openMap}>Open Satisfactory Interactive Map</button>
      {:else}
        <button on:click={getRecipes} class="primary">Get Recipes</button>
      {/if}
    </div>
    {#if isSatisfactoryMap && noSaveLoadedError}
      <p class="error">Load your save game before getting recipes</p>
    {/if}
    <p class="infos">
      Unlocked Alternate Recipes : {alternateRecipes.length === 0
        ? "None"
        : alternateRecipes.length}
      <br />
      Last Updated : {alternateRecipes.length === 0
        ? "Never"
        : distanceToLastUpdated}
    </p>
    <div class="recipes">
      {#each recipes as recipe}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore missing-declaration -->
        <div
          on:click={() => {
            recipe.checked = !recipe.checked;
            alternateRecipes = recipes
              .filter((r) => r.checked)
              .map((r) => r.name);
            storage.setItem("sync:alternateRecipes", alternateRecipes);
          }}
        >
          <input type="checkbox" checked={recipe.checked} />
          <span>
            {recipe.name}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</main>

<style>
  .infos {
    margin: 1.5rem 0;
    font-style: italic;
    font-size: 1rem;
  }
  input[type="checkbox"] {
    cursor: pointer;
    accent-color: #fa9549;
  }
  .buttons {
    display: flex;
    gap: 1rem;
  }

  button.primary {
    background-color: #fa9549;
    color: black;
  }
  .error {
    color: red;
  }
  main {
    padding: 1rem;
    min-width: 520px;
  }
  .loading {
    width: 100px;
    height: 100px;
    border: 10px solid #f3f3f3;
    border-top: 10px solid #3498db;
    border-radius: 50%;
    animation: spin 2s linear infinite;
  }

  .recipes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    font-size: 1rem;
  }

  .recipes div {
    cursor: pointer;
    user-select: none;
    transition: all 0.3s ease;
  }

  .recipes div:hover {
    color: #fa9549;
  }

  .recipes div input {
    pointer-events: none;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
