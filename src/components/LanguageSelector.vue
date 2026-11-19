<script>
    import fuzzysort from 'fuzzysort'
    import { LANGUAGES } from '../editor/languages.js'

    const items = LANGUAGES.map(l => {
        return {
            "token": l.token, 
            "name": l.name,
            "guesslang": l.guesslang,
        }
    }).sort((a, b) => {
        return a.name.localeCompare(b.name)
    })
    items.unshift({token: "auto", name:"Auto-detect"})

    items.forEach((item, idx) => {
        item.preparedName = fuzzysort.prepare(item.name)
    })

    export default {
        data() {
            return {
                selected: 0,
                filter: "",
            }
        },

        mounted() {
            this.$refs.container.focus()
            this.$refs.input.focus()
        },

        computed: {
            filteredItems() {
                if (this.filter === "") {
                    return items
                }
                const searchResults = fuzzysort.go(this.filter, items, {
                    keys: ['name', 'guesslang'],
                })
                return searchResults.map(result => {
                    const highlight = result[0].highlight("<b>", "</b>")
                    return {
                        "token": result.obj.token,
                        "name": highlight || result.obj.name,
                    }
                })
            },
        },

        methods: {
            onKeydown(event) {
                if (event.key === "Escape") {
                    this.$emit("close")
                    event.preventDefault()
                    return
                }
                if (this.filteredItems.length === 0) {
                    return
                }
                if (event.key === "ArrowDown") {
                    this.selected = Math.min(this.selected + 1, this.filteredItems.length - 1)
                    event.preventDefault()
                    if (this.selected === this.filteredItems.length - 1) {
                        this.$refs.container.scrollIntoView({block: "end"})
                    } else {
                        this.$refs.item[this.selected].scrollIntoView({block: "nearest"})
                    }
                    
                } else if (event.key === "ArrowUp") {
                    this.selected = Math.max(this.selected - 1, 0)
                    event.preventDefault()
                    if (this.selected === 0) {
                        this.$refs.container.scrollIntoView({block: "start"})
                    } else {
                        this.$refs.item[this.selected].scrollIntoView({block: "nearest"})
                    }
                } else if (event.key === "Enter") {
                    this.selectItem(this.filteredItems[this.selected].token)
                    event.preventDefault()
                }
            },

            selectItem(token) {
                this.$emit("selectLanguage", token)
            },

            onInput(event) {
                // reset selection
                this.selected = 0
            },

            onFocusOut(event) {
                let container = this.$refs.container
                if (container !== event.relatedTarget && !container.contains(event.relatedTarget)) {
                    this.$emit("close")
                }
            },
        }
    }
</script>

<template>
    <form class="language-selector switcher" tabindex="-1" @focusout="onFocusOut" ref="container" @submit.prevent>
        <div class="switcher-header">
            <label for="language-filter">Block language</label>
            <input
                id="language-filter"
                class="switcher-input"
                type="text"
                placeholder="Search languages or file extensions…"
                autocomplete="off"
                ref="input"
                @keydown="onKeydown"
                @input="onInput"
                v-model="filter"
                spellcheck="false"
            />
        </div>
        <ul class="items switcher-results">
            <li v-if="filteredItems.length === 0" class="switcher-empty" role="status">
                No languages found. Try a language name or file extension.
            </li>
            <li
                v-for="item, idx in filteredItems"
                :key="item.token"
                :class="['switcher-item', {selected: idx === selected}]"
                @click="selectItem(item.token)"
                ref="item"
                v-html="item.name"
            />
        </ul>
        <div class="switcher-footer">
            <span><kbd>↑ ↓</kbd> Navigate</span>
            <span><kbd>Enter</kbd> Select</span>
            <span><kbd>Esc</kbd> Close</span>
        </div>
    </form>
</template>

<style scoped lang="sass">
    .items :deep(b)
        font-weight: 700
</style>
