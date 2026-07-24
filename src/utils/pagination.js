/**
 * Extracts pagination parameters from the request query.
 * @param {Object} query - req.query
 * @returns {Object} { page, limit, skip }
 */
const getPaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.max(1, parseInt(query.limit) || 20);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};

/**
 * Formats the paginated response.
 * @param {Array} data - The array of items
 * @param {number} total - Total count of items matching the query
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Formatted response object
 */
const formatPaginatedResponse = (data, total, page, limit) => {
    return {
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
};

module.exports = {
    getPaginationParams,
    formatPaginatedResponse
};
