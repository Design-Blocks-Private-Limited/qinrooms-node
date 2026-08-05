const Setting = require('../models/Setting');

// Get a setting by key
exports.getSettingByKey = async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await Setting.findOne({ key });
        
        if (!setting) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        
        res.status(200).json({ key: setting.key, value: setting.value });
    } catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({ error: 'Server error fetching setting' });
    }
};

// Create or update a setting by key (Admin only)
exports.updateSettingByKey = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        if (!value) {
            return res.status(400).json({ error: 'Value is required' });
        }

        // Find and update, or create if it doesn't exist (upsert)
        const setting = await Setting.findOneAndUpdate(
            { key },
            { value },
            { new: true, upsert: true }
        );
        
        res.status(200).json({ message: 'Setting updated successfully', setting });
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ error: 'Server error updating setting' });
    }
};
