Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: String, value: '' }
  },

  data: {
    items: [],
    anim: ''
  },

  observers: {
    options(list) {
      this.normalize(list)
    }
  },

  pageLifetimes: {
    show() {
      this.setData({ anim: this.data.anim === 'a' ? 'b' : 'a' })
    }
  },

  lifetimes: {
    attached() {
      this.normalize(this.data.options)
    }
  },

  methods: {
    normalize(list) {
      const items = (list || []).map((o) => {
        if (typeof o === 'string') return { value: o, label: o }
        return { value: o.value, label: o.label }
      })
      this.setData({ items })
    },

    onTap(e) {
      const value = e.currentTarget.dataset.value
      if (value === this.data.value) return
      this.triggerEvent('change', { value })
    }
  }
})
